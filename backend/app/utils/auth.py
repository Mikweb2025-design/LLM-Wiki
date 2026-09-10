"""Auth semplice a token HMAC per login singolo (solo stdlib, nessuna dipendenza)."""
import base64
import hashlib
import hmac
import os
import secrets
import time

TOKEN_TTL_SECONDS = int(os.getenv("DOK_SESSION_HOURS", "168")) * 3600  # default 7 giorni

def get_user() -> str:
    return os.getenv("DOK_USER", "Mikweb")

def _secret() -> bytes:
    s = os.getenv("DOK_SECRET", "")
    if s:
        return s.encode()
    # segreto persistente su disco (sopravvive ai restart, mai nel repo)
    for p in ("backend/data/.auth_secret", "data/.auth_secret", "/tmp/llmwiki_auth_secret"):
        try:
            if os.path.exists(p):
                with open(p, "r") as f:
                    v = f.read().strip()
                    if len(v) >= 16:
                        return v.encode()
        except Exception:
            pass
    v = secrets.token_hex(32)
    for p in ("backend/data/.auth_secret", "data/.auth_secret"):
        try:
            d = os.path.dirname(p)
            if os.path.isdir(d):
                with open(p, "w") as f:
                    f.write(v)
                try:
                    os.chmod(p, 0o600)
                except Exception:
                    pass
                break
        except Exception:
            pass
    return v.encode()

def create_token(username: str) -> str:
    exp = int(time.time()) + TOKEN_TTL_SECONDS
    body = f"{username}.{exp}"
    sig = hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()
    raw = f"{body}.{sig}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")

def verify_token(token: str):
    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode()).decode()
        username, exp_s, sig = raw.rsplit(".", 2)
        exp = int(exp_s)
        if exp < time.time():
            return None
        body = f"{username}.{exp}"
        want = hmac.new(_secret(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(want, sig):
            return None
        if not hmac.compare_digest(username, get_user()):
            return None
        return {"username": username, "exp": exp}
    except Exception:
        return None

def check_credentials(username: str, password: str) -> bool:
    want_u = get_user()
    want_p = os.getenv("DOK_PASSWORD", "")
    if not want_p:
        return False
    return secrets.compare_digest(username or "", want_u) and secrets.compare_digest(password or "", want_p)
