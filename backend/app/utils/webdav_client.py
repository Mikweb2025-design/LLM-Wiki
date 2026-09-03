"""WebDAV client per Nextcloud — PROPFIND + GET + ETag sync"""
import re
import os
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from urllib.parse import urljoin, quote, unquote, urlparse

import httpx

# Namespace WebDAV
NS = {"d": "DAV:"}

SUPPORTED_EXTS = {'.pdf','.docx','.xlsx','.xls','.txt','.md','.csv','.html','.htm','.pptx','.ppt','.rtf','.png','.jpg','.jpeg','.gif','.tiff','.bmp','.webp'}

def _propfind_body():
    return """<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getetag/>
    <d:getcontentlength/>
    <d:getcontenttype/>
    <d:getlastmodified/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>"""

def _parse_propfind(xml_text: str, base_url: str) -> List[Dict]:
    """Parse 207 Multi-Status XML → list di {href, etag, size, content_type, last_modified, is_collection}"""
    try:
        root = ET.fromstring(xml_text.encode() if isinstance(xml_text, str) else xml_text)
    except Exception as e:
        print(f"[WARN] WebDAV XML parse: {e}")
        return []
    items=[]
    for resp in root.findall("d:response", NS):
        href_el = resp.find("d:href", NS)
        if href_el is None or not href_el.text:
            continue
        href = unquote(href_el.text.strip())
        # prendi il primo propstat 200
        prop = None
        for ps in resp.findall("d:propstat", NS):
            status = ps.find("d:status", NS)
            if status is not None and "200" in (status.text or ""):
                prop = ps.find("d:prop", NS)
                break
        if prop is None:
            prop = resp.find("d:propstat/d:prop", NS)
            if prop is None:
                continue
        def _t(tag): 
            el = prop.find(f"d:{tag}", NS)
            return el.text.strip() if el is not None and el.text else None
        etag = _t("getetag")
        if etag: etag = etag.strip('"')
        size = _t("getcontentlength")
        try: size = int(size) if size else 0
        except: size=0
        ctype = _t("getcontenttype")
        lastmod = _t("getlastmodified")
        rtype = prop.find("d:resourcetype", NS)
        is_coll = 0
        if rtype is not None and rtype.find("d:collection", NS) is not None:
            is_coll=1
        # filename da href
        fname = href.rstrip("/").split("/")[-1]
        # decodifica
        fname = unquote(fname)
        items.append({
            "href": href,
            "filename": fname,
            "etag": etag or "",
            "size_bytes": size,
            "content_type": ctype or "",
            "last_modified": lastmod or "",
            "is_collection": is_coll,
        })
    return items

def webdav_propfind(base_url: str, remote_path: str, username: str, password: str, depth: int = 1, timeout: float = 20.0) -> Tuple[bool, str, List[Dict]]:
    """
    Esegue PROPFIND Depth: depth su base_url + remote_path.
    base_url es: https://cloud.example.com/remote.php/dav/files/alice
    remote_path es: /Documents  (verrà appeso a base_url)
    Ritorna (ok, error_msg, items)
    """
    # costruisci URL target
    base = base_url.rstrip("/")
    rp = remote_path.strip()
    if not rp.startswith("/"): rp="/"+rp
    # evita doppio slash, ma mantieni encoding per segmenti
    # encode ogni segmento separatamente
    segs = [quote(s, safe="") for s in rp.split("/") if s]
    encoded_path = "/" + "/".join(segs) if segs else "/"
    target = base + encoded_path
    # Nextcloud vuole Depth header "0" | "1" | "infinity" (usiamo 1)
    headers = {"Depth": str(depth), "Content-Type": "application/xml; charset=utf-8"}
    body = _propfind_body()
    try:
        with httpx.Client(auth=(username, password), timeout=timeout, follow_redirects=True) as client:
            resp = client.request("PROPFIND", target, content=body, headers=headers)
            if resp.status_code in (207, 200):
                items = _parse_propfind(resp.text, base)
                # Filtra: il primo item è la cartella stessa (is_collection) — lo teniamo ma chi chiama può skippare
                return True, "", items
            elif resp.status_code == 401:
                return False, "Autenticazione fallita (401) — verifica username / app-password", []
            elif resp.status_code == 404:
                return False, f"Percorso non trovato (404): {rp} — verifica che la cartella esista su Nextcloud", []
            elif resp.status_code == 423:
                return False, "Risorsa bloccata (423) — riprova più tardi", []
            else:
                return False, f"PROPFIND errore {resp.status_code}: {resp.text[:500]}", []
    except httpx.TimeoutException:
        return False, "Timeout connessione a Nextcloud — verifica URL/host", []
    except Exception as e:
        return False, f"Errore connessione: {e}", []

def webdav_list_folders(base_url: str, username: str, password: str, remote_path: str = "/") -> Tuple[bool, str, List[Dict]]:
    """Lista solo cartelle (Depth 1, filtra is_collection)."""
    ok, msg, items = webdav_propfind(base_url, remote_path, username, password, depth=1)
    if not ok:
        return ok, msg, []
    # rimuovi self (href == base+path)
    folders = [it for it in items if it["is_collection"]]
    # escludi self: quello con href che termina senza extra segment? Il primo è self — saltiamolo se più di 1
    if len(folders) > 1:
        # self è quello con filename == ultimo segmento di remote_path o vuoto
        rp_last = remote_path.strip("/").split("/")[-1] if remote_path.strip("/") else ""
        # self ha href che corrisponde esattamente a base+remote_path
        # semplice: rimuovi primo se è self (is_collection e filename == rp_last)
        # ma per robustezza rimuovi quello con filename == rp_last e depth 0 behavior
        # invece teniamo tutti tranne quello che corrisponde a remote_path stesso
        self_href_variants = set()
        # non filtrare troppo: se remote_path="/" self filename è "" — rimuovi quello vuoto
        folders_filtered=[]
        for f in folders:
            if not f["filename"] and remote_path.strip("/")=="":
                continue
            if f["filename"]==rp_last and f["href"].rstrip("/").endswith("/"+rp_last) and len(folders)>1:
                # potrebbe essere self — ma se ce ne sono altri con stesso nome? poco probabile
                # salta solo il primo occorso
                if folders_filtered==[] or any(x["filename"]==f["filename"] for x in folders_filtered):
                    # se già abbiamo filtrato, salta solo se è duplicato primo
                    pass
                # decide: skip primo is_collection that matches self
                if f is folders[0]:
                    continue
            folders_filtered.append(f)
        folders = folders_filtered
    return True, "", folders

def webdav_download(base_url: str, href: str, username: str, password: str, dest_path: str, timeout: float = 60.0) -> Tuple[bool, str]:
    """Scarica un file via GET. href è quello ritornato da PROPFIND (già url-decoded, va re-encoded)."""
    # href potrebbe essere assoluto tipo /remote.php/dav/files/alice/Documents/file.pdf
    # base_url è tipo https://cloud.example.com/remote.php/dav/files/alice
    # Ricostruisci URL completo: se href inizia con / usa host di base_url
    parsed_base = urlparse(base_url)
    origin = f"{parsed_base.scheme}://{parsed_base.netloc}"
    # href dal server è già absolute path — usalo
    # Re-encode segments per sicurezza
    segs = [quote(unquote(s), safe="") for s in href.split("/")]
    # ma quote ha già encodato, evita doppio // 
    encoded_href = "/".join(segs).replace("//","/")
    if not encoded_href.startswith("/"): encoded_href="/"+encoded_href
    target = origin + encoded_href
    try:
        with httpx.Client(auth=(username, password), timeout=timeout, follow_redirects=True) as client:
            with client.stream("GET", target) as resp:
                if resp.status_code != 200:
                    return False, f"GET {resp.status_code}: {resp.text[:300] if hasattr(resp,'text') else ''}"
                # extension check
                # salva su dest
                with open(dest_path, "wb") as f:
                    for chunk in resp.iter_bytes(chunk_size=32768):
                        f.write(chunk)
                return True, ""
    except Exception as e:
        return False, str(e)

def webdav_test_connection(url: str, username: str, password: str) -> Tuple[bool, str]:
    """Test rapido: PROPFIND Depth 0 sulla root del user."""
    # url dovrebbe essere tipo https://cloud.example.com/remote.php/dav/files/USERNAME
    # se utente passa solo host, prova a costruire
    u = url.strip().rstrip("/")
    if "remote.php" not in u:
        # prova common Nextcloud dav endpoint
        u = u.rstrip("/") + f"/remote.php/dav/files/{quote(username)}"
    ok, msg, _ = webdav_propfind(u, "/", username, password, depth=0)
    if ok:
        return True, u  # ritorna url normalizzato
    return False, msg

def is_supported_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in SUPPORTED_EXTS
