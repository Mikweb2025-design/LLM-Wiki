"""HiDrive REST API client — OAuth2 + list_dir + download (niente WebDAV).

Implementazione rispecchia il provider HiDrive già in produzione su Clumoove
(/opt/clumoove/backend/internal/storage/hidrive.go + internal/oauth/oauth.go),
stessi client_id/secret, stessi endpoint e parametri:

- Authorize: https://my.hidrive.com/client/authorize
             ?client_id=...&redirect_uri=...&response_type=code&state=...&scope=admin,rw
             ("admin,rw" è UN singolo scope comma-separated)
- Token:     POST https://my.hidrive.com/oauth2/token (form-encoded)
             grant_type=authorization_code (+code+redirect_uri, primo login) ->
                 access+refresh token
             grant_type=refresh_token (rinnovi automatici, refresh 60gg auto-extend)
- API: header Authorization: Bearer <access_token>, base https://api.hidrive.strato.com/2.1
- Connect:   GET /user/me?fields=account,alias,home
- Lista:     GET /dir?path=..&members=file,dir&fields=path,name,members.name,
             members.type,members.size,members.mtime,members.readable,
             members.writable,members.id,members.mime_type&limit=off,n&sort=name
             -> {path, name, members: [{name, type, size, mtime, ...}]}
             (sha1 NON è un field valido -> 400; l'hash nativo è chash)
- Download:  GET /file?path=..
- Dettaglio critico: HiDrive serializza path/name URL-escaped nel JSON ->
  vanno decodificati (unquote) prima dell'uso, altrimenti doppio escape = 404.

Token storage: DATA_DIR/hidrive_token.json (access + refresh + expires_at).
HIDRIVE_REFRESH_TOKEN in .env fa da seed al primo avvio. I segreti non vengono
mai stampati nei log.
"""
import json
import os
import threading
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlencode, unquote

import httpx

from app.config import DATA_DIR
from app.utils.webdav_client import SUPPORTED_EXTS

HIDRIVE_API_BASE = "https://api.hidrive.strato.com/2.1"
HIDRIVE_AUTH_URL = "https://my.hidrive.com/client/authorize"
HIDRIVE_TOKEN_URL = "https://my.hidrive.com/oauth2/token"

# Stessa app OAuth di Clumoove: redirect_uri registrato sul server.
DEFAULT_REDIRECT_URI = os.getenv(
    "HIDRIVE_REDIRECT_URI", "https://migration.mikweb.eu/api/oauth/callback"
)
DEFAULT_SCOPE = os.getenv("HIDRIVE_SCOPE", "admin,rw")

# Fieldset provato su Clumoove (sha1 escluso: causa 400).
DIR_FIELDS = (
    "path,name,members.name,members.type,members.size,members.mtime,"
    "members.readable,members.writable,members.id,members.mime_type"
)
DIR_PAGE_SIZE = 5000

_TOKEN_FILE = DATA_DIR / "hidrive_token.json"
_refresh_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Token condiviso da Clumoove (stesso metodo, zero nuovo login).
# Clumoove salva in connection_profiles (postgres):
#   password_encrypted (access, domain clumoove:oauth-access-token),
#   refresh_token_encrypted (domain clumoove:oauth-refresh-token),
#   token_expires_at.
# Cifratura: AES-256-GCM, key = SHA256(ENCRYPTION_SECRET_KEY),
# envelope "v1:" + hex(nonce12 + sealed), AAD = domain.
# (cfr. /opt/clumoove/backend/internal/crypto/crypto.go +
#  restore/coordinator.go ensureFreshRepositoryOAuthToken)
# Lettura SOLA: i token rinnovati restano nel file locale di llm-wiki.
# ---------------------------------------------------------------------------
_CLUMOOVE_DOMAIN_ACCESS = "clumoove:oauth-access-token"
_CLUMOOVE_DOMAIN_REFRESH = "clumoove:oauth-refresh-token"
_shared_warn_done = False
_shared_cache: Dict = {"ts": 0.0, "profile": None}
_SHARED_CACHE_TTL = 60.0


def _get_shared_profile_cached() -> Optional[Dict]:
    now = time.time()
    if (now - _shared_cache["ts"]) < _SHARED_CACHE_TTL:
        return _shared_cache["profile"]
    prof = _read_shared_profile()
    _shared_cache.update(ts=now, profile=prof)
    return prof


def _clumoove_decrypt(envelope: str, secret: str, domain: str) -> str:
    """Replica DecryptWithDomain di Clumoove."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import hashlib
    import binascii

    if not envelope or not envelope.startswith("v1:"):
        raise ValueError("envelope non v1")
    raw = binascii.unhexlify(envelope[3:])
    if len(raw) < 12 + 16:
        raise ValueError("envelope troppo corto")
    nonce, sealed = raw[:12], raw[12:]
    key = hashlib.sha256(secret.encode()).digest()
    return AESGCM(key).decrypt(nonce, sealed, domain.encode()).decode("utf-8")


def _read_shared_profile() -> Optional[Dict]:
    """Legge l'ultimo profilo hidrive da Clumoove (solo nomi in log, mai segreti)."""
    db_url = (os.getenv("CLUMOOVE_DB_URL") or "").strip()
    secret = (os.getenv("CLUMOOVE_ENCRYPTION_KEY") or "").strip()
    if not db_url or not secret:
        return None
    try:
        import psycopg
        with psycopg.connect(db_url, connect_timeout=8) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT password_encrypted, refresh_token_encrypted, token_expires_at
                       FROM connection_profiles WHERE provider='hidrive'
                       ORDER BY updated_at DESC LIMIT 1"""
                )
                row = cur.fetchone()
        if not row:
            return None
        access_enc, refresh_enc, expires_at = row
        try:
            access = _clumoove_decrypt(access_enc or "", secret, _CLUMOOVE_DOMAIN_ACCESS) if access_enc else ""
        except Exception:
            access = ""
        try:
            refresh = _clumoove_decrypt(refresh_enc or "", secret, _CLUMOOVE_DOMAIN_REFRESH) if refresh_enc else ""
        except Exception:
            refresh = ""
        exp_ts = 0.0
        try:
            if expires_at is not None:
                exp_ts = expires_at.timestamp() if hasattr(expires_at, "timestamp") else float(expires_at)
        except Exception:
            exp_ts = 0.0
        if not access and not refresh:
            return None
        return {"access_token": access, "refresh_token": refresh, "expires_at": exp_ts}
    except Exception as e:
        global _shared_warn_done
        if not _shared_warn_done:
            print(f"[WARN] HiDrive token condiviso non leggibile: {type(e).__name__}")
            _shared_warn_done = True
        return None


def _redact(msg: str) -> str:
    """Rimuove eventuali token finiti per sbaglio in un messaggio di errore."""
    if not msg:
        return msg
    import re
    msg = re.sub(r"(Bearer\s+)[A-Za-z0-9\-._~+/=]{8,}", r"\1***", msg)
    msg = re.sub(r"((?:access|refresh)_token[\"']?\s*[:=]\s*[\"']?)[A-Za-z0-9\-._~+/=]{8,}", r"\1***", msg)
    return msg


def _client_id() -> str:
    return (os.getenv("HIDRIVE_CLIENT_ID") or "").strip()


def _client_secret() -> str:
    return (os.getenv("HIDRIVE_CLIENT_SECRET") or "").strip()


def is_configured() -> Tuple[bool, str]:
    """Verifica che client_id/secret siano impostati (senza rivelarli)."""
    if not _client_id() or not _client_secret():
        return False, "HIDRIVE_CLIENT_ID / HIDRIVE_CLIENT_SECRET mancanti nel .env del backend"
    return True, ""


def _read_token_file() -> Dict:
    try:
        if _TOKEN_FILE.exists():
            return json.loads(_TOKEN_FILE.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"[WARN] HiDrive token file illeggibile: {e}")
    return {}


def _write_token_file(data: Dict) -> None:
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        _TOKEN_FILE.write_text(json.dumps(data), encoding="utf-8")
        try:
            os.chmod(_TOKEN_FILE, 0o600)
        except Exception:
            pass
    except Exception as e:
        print(f"[WARN] HiDrive token file non scrivibile: {e}")


def _seeded_refresh_token() -> str:
    """Refresh token noto: condiviso Clumoove prima, file cache poi, .env come seed."""
    try:
        prof = _get_shared_profile_cached()
        if prof and prof.get("refresh_token"):
            return prof["refresh_token"]
    except Exception:
        pass
    cached = _read_token_file().get("refresh_token") or ""
    if cached:
        return cached
    return (os.getenv("HIDRIVE_REFRESH_TOKEN") or "").strip()


def authorize_url(
    redirect_uri: str = None,
    scope: str = None,
    state: str = "llm-wiki",
) -> str:
    """URL da aprire nel browser per il primo login (stessa app di Clumoove)."""
    redirect_uri = (redirect_uri or DEFAULT_REDIRECT_URI).strip()
    scope = (scope or DEFAULT_SCOPE).strip()
    qs = urlencode({
        "client_id": _client_id(),
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "state": state,
        "scope": scope,
    })
    return f"{HIDRIVE_AUTH_URL}?{qs}"


def _store_token_response(data: Dict) -> None:
    now = time.time()
    prev = _read_token_file()
    stored = {
        "access_token": data.get("access_token", ""),
        "refresh_token": data.get("refresh_token") or prev.get("refresh_token") or "",
        "token_type": data.get("token_type", "Bearer"),
        "expires_at": now + int(data.get("expires_in", 3600)),
        "updated_at": now,
    }
    _write_token_file(stored)


def _token_post(form: Dict) -> Tuple[bool, Dict | str]:
    """POST form-encoded al token endpoint. Ritorna (ok, json|errore)."""
    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.post(HIDRIVE_TOKEN_URL, data=form)
    except Exception as e:
        return False, f"Errore connessione token endpoint: {_redact(str(e))}"
    if resp.status_code != 200:
        return False, f"Token endpoint {resp.status_code}: {_redact(resp.text[:300])}"
    try:
        return True, resp.json()
    except Exception:
        return False, "Risposta token non-JSON"


def exchange_code(code: str, redirect_uri: str = None) -> Tuple[bool, str]:
    """Scambia authorization_code (una tantum, manuale) -> salva access+refresh token."""
    ok, msg = is_configured()
    if not ok:
        return False, msg
    redirect_uri = (redirect_uri or DEFAULT_REDIRECT_URI).strip()
    ok, data = _token_post({
        "code": code.strip(),
        "grant_type": "authorization_code",
        "client_id": _client_id(),
        "client_secret": _client_secret(),
        "redirect_uri": redirect_uri,
    })
    if not ok:
        return False, data  # type: ignore[return-value]
    if "access_token" not in data:
        return False, f"Risposta senza access_token: {sorted(data.keys())}"
    _store_token_response(data)
    has_refresh = bool(data.get("refresh_token"))
    return True, "Token salvati" + ("" if has_refresh else " (senza refresh_token: servirà nuovo login alla scadenza)")


def _refresh_access_token() -> Tuple[bool, str]:
    """Rinnova access_token via refresh_token. Ritorna (ok, access_token|errore)."""
    ok, msg = is_configured()
    if not ok:
        return False, msg
    refresh = _seeded_refresh_token()
    if not refresh:
        return False, "Nessun refresh_token: completa il primo login (GET /api/documents/hidrive/auth-url)"
    ok, data = _token_post({
        "grant_type": "refresh_token",
        "refresh_token": refresh,
        "client_id": _client_id(),
        "client_secret": _client_secret(),
    })
    if not ok:
        return False, data  # type: ignore[return-value]
    if "access_token" not in data:
        return False, f"Refresh senza access_token: {sorted(data.keys())}"
    _store_token_response(data)
    return True, data["access_token"]


def get_access_token() -> Tuple[bool, str]:
    """Access token valido (cache o refresh automatico). Thread-safe.

    Come Clumoove (ensureFreshRepositoryOAuthToken): se il profilo condiviso
    ha un access token ancora fresco lo riusa diretto, altrimenti refresh.
    """
    with _refresh_lock:
        try:
            prof = _get_shared_profile_cached()
            if prof and prof.get("access_token") and (prof.get("expires_at") or 0) - time.time() > 120:
                return True, prof["access_token"]
        except Exception:
            pass
        cached = _read_token_file()
        token = (cached.get("access_token") or "").strip()
        expires_at = float(cached.get("expires_at") or 0)
        if token and expires_at - time.time() > 120:
            return True, token
        return _refresh_access_token()


def _api_headers() -> Tuple[bool, Dict | str]:
    ok, token_or_err = get_access_token()
    if not ok:
        return False, token_or_err
    return True, {"Authorization": f"Bearer {token_or_err}"}


def _invalidate_cached_token() -> None:
    with _refresh_lock:
        cached = _read_token_file()
        cached["expires_at"] = 0
        _write_token_file(cached)


def check_connection() -> Tuple[bool, str]:
    """Verifica token via GET /user/me (come Clumoove Connect)."""
    ok, headers_or_err = _api_headers()
    if not ok:
        return False, headers_or_err
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.get(
                f"{HIDRIVE_API_BASE}/user/me",
                headers=headers_or_err,
                params={"fields": "account,alias,home"},
            )
    except Exception as e:
        return False, f"Errore connessione HiDrive API: {_redact(str(e))}"
    if resp.status_code == 200:
        try:
            info = resp.json()
            who = info.get("alias") or info.get("account") or "?"
        except Exception:
            who = "?"
        return True, f"Connesso (account: {who})"
    if resp.status_code in (401, 403):
        _invalidate_cached_token()
        return False, "Token non valido (401/403): sarà rinnovato al prossimo tentativo"
    return False, f"HiDrive API {resp.status_code}: {_redact(resp.text[:300])}"


def _clean_path(p: str) -> str:
    """Come cleanPath di Clumoove: assicura leading slash, normalizza."""
    import posixpath
    p = (p or "").strip()
    if not p or p == "/":
        return "/"
    if not p.startswith("/"):
        p = "/" + p
    return posixpath.normpath(p).replace("//", "/")


def _normalize_member(item: Dict, parent: str) -> Optional[Dict]:
    """Normalizza un membro /dir (schema provato su Clumoove + fallback tolleranti)."""
    if not isinstance(item, dict):
        return None
    raw_name = item.get("name") or item.get("filename") or item.get("title") or ""
    if not raw_name:
        return None
    try:
        name = unquote(str(raw_name))
    except Exception:
        name = str(raw_name)
    raw_type = str(item.get("type") or item.get("kind") or "").lower()
    is_dir = raw_type == "dir"
    if not raw_type and (item.get("is_dir") is True or item.get("is_collection") is True):
        is_dir = True
    size = item.get("size", item.get("size_bytes", 0)) or 0
    try:
        size = int(size)
    except (ValueError, TypeError):
        size = 0
    mtime = item.get("mtime", item.get("mtime_ts", item.get("last_modified")))
    try:
        mtime = float(mtime or 0)
    except (ValueError, TypeError):
        mtime = 0.0
    full_path = (parent.rstrip("/") + "/" + name) if parent != "/" else ("/" + name)
    return {
        "name": name,
        "path": full_path,
        "pid": str(item.get("id") or item.get("pid") or ""),
        "is_dir": is_dir,
        "size": size,
        "mtime": mtime,
        "mime_type": str(item.get("mime_type") or item.get("content_type") or ""),
        "chash": str(item.get("chash") or ""),
    }


def list_dir(hi_path: str, timeout: float = 120.0) -> Tuple[bool, str, List[Dict]]:
    """Lista il contenuto di una cartella HiDrive (paginato, come Clumoove).

    Ritorna (ok, errore, items normalizzati)."""
    ok, headers_or_err = _api_headers()
    if not ok:
        return False, headers_or_err, []
    hi_path = _clean_path(hi_path or "/")
    items: List[Dict] = []
    offset = 0
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            while True:
                resp = client.get(
                    f"{HIDRIVE_API_BASE}/dir",
                    headers=headers_or_err,
                    params={
                        "path": hi_path,
                        "members": "file,dir",
                        "fields": DIR_FIELDS,
                        "limit": f"{offset},{DIR_PAGE_SIZE}",
                        "sort": "name",
                    },
                )
                if resp.status_code in (401, 403):
                    _invalidate_cached_token()
                    return False, "Token scaduto (401/403): riprova, sarà rinnovato automaticamente", []
                if resp.status_code != 200:
                    return False, f"GET /dir {resp.status_code}: {_redact(resp.text[:300])}", []
                try:
                    payload = resp.json()
                except Exception:
                    return False, "Risposta /dir non-JSON", []
                raw_members = payload.get("members", []) if isinstance(payload, dict) else []
                if isinstance(raw_members, dict):
                    raw_members = list(raw_members.values())
                for m in raw_members or []:
                    norm = _normalize_member(m, hi_path)
                    if norm:
                        items.append(norm)
                if len(raw_members or []) < DIR_PAGE_SIZE:
                    break
                offset += DIR_PAGE_SIZE
    except Exception as e:
        return False, f"Errore connessione HiDrive API: {_redact(str(e))}", []
    return True, "", items


def download_file(remote_path: str, dest_path: str, timeout: float = 300.0) -> Tuple[bool, str]:
    """Scarica un file HiDrive (GET /file?path=..) su dest_path. Ritorna (ok, errore)."""
    ok, headers_or_err = _api_headers()
    if not ok:
        return False, headers_or_err
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            with client.stream(
                "GET", f"{HIDRIVE_API_BASE}/file",
                headers=headers_or_err, params={"path": _clean_path(remote_path)},
            ) as resp:
                if resp.status_code in (401, 403):
                    _invalidate_cached_token()
                    return False, "Token scaduto (401/403): riprova, sarà rinnovato automaticamente"
                if resp.status_code != 200:
                    body = ""
                    try:
                        body = resp.read().decode("utf-8", "ignore")[:300]
                    except Exception:
                        pass
                    return False, f"GET /file {resp.status_code}: {_redact(body)}"
                Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
                with open(dest_path, "wb") as f:
                    for chunk in resp.iter_bytes(chunk_size=65536):
                        f.write(chunk)
        return True, ""
    except Exception as e:
        return False, f"Errore download: {_redact(str(e))}"


def is_supported_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in SUPPORTED_EXTS


def hidrive_status() -> Dict:
    """Stato configurazione (senza mai esporre segreti)."""
    ok_cfg, cfg_msg = is_configured()
    token_file = _read_token_file()
    try:
        shared = bool((_get_shared_profile_cached() or {}).get("refresh_token"))
    except Exception:
        shared = False
    return {
        "configured": ok_cfg,
        "config_error": None if ok_cfg else cfg_msg,
        "shared_profile": shared,
        "has_refresh_token": bool(_seeded_refresh_token()),
        "has_access_token_cached": bool(token_file.get("access_token")),
        "token_expires_in": max(0, int(float(token_file.get("expires_at") or 0) - time.time())) if token_file.get("expires_at") else 0,
    }
