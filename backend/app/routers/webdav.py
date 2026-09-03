"""Router Nextcloud / WebDAV — connect, folder picker, incremental sync"""
import os
import tempfile
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException

from app.utils.database import (
    add_webdav_source, get_webdav_sources, get_webdav_source, get_webdav_password,
    remove_webdav_source, update_webdav_sync_status, upsert_webdav_file, get_webdav_files,
    add_document, remove_document, get_document,
    log_activity,
)
from app.utils.webdav_client import (
    webdav_propfind, webdav_list_folders, webdav_download, webdav_test_connection,
    is_supported_file,
)
from app.utils.document_processor import process_document, get_document_metadata
from app.utils.vector_store import add_document_to_store, remove_document_from_store
from app.utils.auto_tagger import auto_tag_document

router = APIRouter(prefix="/api/webdav", tags=["webdav"])

@router.get("/sources")
async def list_sources():
    """Lista sorgenti WebDAV configurate (senza password)."""
    srcs = get_webdav_sources()
    return {"sources": srcs}

@router.post("/test")
async def test_connection(payload: dict):
    """Valida credenziali WebDAV senza salvare. Body: {url, username, password}"""
    url = (payload.get("url") or "").strip()
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    if not url or not username or not password:
        raise HTTPException(status_code=400, detail="URL, username e password richiesti")
    ok, msg = webdav_test_connection(url, username, password)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    # msg contiene url normalizzato se ok
    return {"status": "ok", "normalized_url": msg}

@router.post("/connect")
async def connect_source(payload: dict):
    """
    Crea/aggiorna sorgente WebDAV e lista cartelle disponibili (Depth 1 sulla root).
    Body: {url, username, password, name?, remote_path?}
    remote_path è la cartella Nextcloud da esplorare per picker (default "/")
    """
    url = (payload.get("url") or "").strip()
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    name = (payload.get("name") or "").strip() or f"nextcloud-{username}"
    picker_path = (payload.get("remote_path") or payload.get("picker_path") or "/").strip() or "/"

    if not url or not username or not password:
        raise HTTPException(status_code=400, detail="URL, username e password richiesti")

    # valida prima
    ok, norm_or_msg = webdav_test_connection(url, username, password)
    if not ok:
        raise HTTPException(status_code=400, detail=norm_or_msg)
    normalized_url = norm_or_msg

    # lista cartelle per picker
    ok2, msg2, folders = webdav_list_folders(normalized_url, username, password, picker_path)
    # salva comunque la sorgente anche se picker fallisce? salva come sorgente base con remote_path = picker_path o "/"
    # Per ora salviamo solo se nome non esiste già? add_webdav_source fa upsert
    source_id = add_webdav_source(name, normalized_url, username, password, remote_path="/")

    if not ok2:
        # ritorna comunque sorgente creata ma con warning picker
        return {"status": "connected", "source_id": source_id, "name": name, "url": normalized_url, "picker_path": picker_path, "folders": [], "picker_error": msg2}
    return {"status": "connected", "source_id": source_id, "name": name, "url": normalized_url, "picker_path": picker_path, "folders": folders}

@router.get("/folders")
async def list_webdav_folders(source_id: int, path: str = "/"):
    """Lista cartelle/file in un path remote per un source_id esistente (picker)."""
    src = get_webdav_source(source_id=source_id)
    if not src:
        raise HTTPException(status_code=404, detail="Sorgente non trovata")
    pw = get_webdav_password(src)
    ok, msg, items = webdav_propfind(src["url"], path, src["username"], pw, depth=1)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    # separa cartelle e file utili
    folders = [x for x in items if x["is_collection"]]
    files = [x for x in items if not x["is_collection"] and is_supported_file(x["filename"])]
    return {"path": path, "folders": folders, "files": files, "all": items}

@router.post("/add-folder")
async def add_webdav_folder(payload: dict):
    """
    Aggiunge una cartella WebDAV da indicizzare.
    Body: {source_id, remote_path, name?}
    Crea/aggiorna webdav_source figlia con remote_path specifico? Per semplicità: se source_id esiste e remote_path diverso da "/", crea una nuova source con nome derivato.
    Altrimenti usa la source esistente e aggiorna remote_path.
    """
    source_id = payload.get("source_id")
    remote_path = (payload.get("remote_path") or "/").strip() or "/"
    name = (payload.get("name") or "").strip()
    if not source_id:
        raise HTTPException(status_code=400, detail="source_id richiesto")
    src = get_webdav_source(source_id=int(source_id))
    if not src:
        raise HTTPException(status_code=404, detail="Sorgente non trovata")
    if not name:
        # deriva da remote_path
        segs = [s for s in remote_path.strip("/").split("/") if s]
        name = segs[-1] if segs else src["name"] + "-root"
        # evita collisione
        name = f"{src['name']}/{name}" if src["name"] not in name else name
    # verifica che il path esista
    pw = get_webdav_password(src)
    ok, msg, _ = webdav_propfind(src["url"], remote_path, src["username"], pw, depth=0)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    # crea nuova source dedicata a questo folder (riusa credenziali)
    new_id = add_webdav_source(name, src["url"], src["username"], pw, remote_path=remote_path)
    return {"status": "added", "source_id": new_id, "name": name, "remote_path": remote_path, "url": src["url"]}

@router.delete("/sources/{source_id}")
async def delete_source(source_id: int):
    ok = remove_webdav_source(source_id)
    if not ok:
        raise HTTPException(status_code=500, detail="Errore eliminazione")
    return {"status": "deleted", "source_id": source_id}

@router.get("/files")
async def list_indexed_files(source_id: int):
    src = get_webdav_source(source_id=source_id)
    if not src:
        raise HTTPException(status_code=404, detail="Sorgente non trovata")
    files = get_webdav_files(source_id)
    return {"source_id": source_id, "count": len(files), "files": files}

def _sync_one_source(source_id: int, max_files: int = 100) -> dict:
    """Sync sincrono di una sorgente: PROPFIND, download file nuovi/modificati, rimuove cancellati."""
    src = get_webdav_source(source_id=source_id)
    if not src:
        return {"error": "Sorgente non trovata"}
    pw = get_webdav_password(src)
    remote_path = src.get("remote_path") or "/"
    ok, msg, items = webdav_propfind(src["url"], remote_path, src["username"], pw, depth=1)
    if not ok:
        update_webdav_sync_status(source_id, f"error: {msg}")
        return {"error": msg}
    # items include self; skip self
    self_href = None
    # self è primo item con is_collection e href che corrisponde a remote_path
    # semplice: escludi item con href che termina esattamente con remote_path normalizzato e is_collection
    # Ma per robustezza: escludi quello con is_collection e filename == ultimo segmento di remote_path se len>1
    filtered=[]
    for it in items:
        if it["is_collection"]:
            # skip self collection? manteniamo solo file; le cartelle non si indicizzano
            continue
        if not is_supported_file(it["filename"]):
            continue
        filtered.append(it)
    # limita
    filtered = filtered[:max_files]
    # upsert etag in DB per tracking
    for it in filtered:
        upsert_webdav_file(source_id, it["href"], it["filename"], it["etag"], it["size_bytes"], it["last_modified"], it["content_type"], 0)

    # trova file già in webdav_files ma non più presenti → cancellati su Nextcloud → rimuovi da indice
    existing = get_webdav_files(source_id)
    # existing includes previous files that are not collections
    existing_hrefs = {e["href"] for e in existing if not e["is_collection"]}
    current_hrefs = {it["href"] for it in filtered}
    deleted_hrefs = existing_hrefs - current_hrefs
    deleted_count=0
    for href in deleted_hrefs:
        # trova filename per href
        ent = next((e for e in existing if e["href"]==href), None)
        if not ent: continue
        fname = ent["filename"]
        # rimuovi da vector store + documents se presente
        doc = get_document(fname)
        if doc:
            try:
                remove_document_from_store(fname.replace(" ","_").lower())
                remove_document(fname)
                # rimuovi file temporaneo se era stato scaricato in cache webdav?
                # documents table ha file_path che per webdav è temp path — rimuovi
                fp = doc.get("file_path")
                if fp and Path(fp).exists():
                    try: os.remove(fp)
                    except: pass
            except Exception as e:
                print(f"[WARN] delete removed webdav file {fname}: {e}")
        # rimuovi da webdav_files
        from app.utils.database import delete_webdav_file
        delete_webdav_file(source_id, href)
        deleted_count+=1
        log_activity("webdav_deleted", fname, href)

    # per ogni file filtrato, verifica se nuovo o etag cambiato → scarica e reindicizza
    # crea dir cache per webdav downloads
    from app.config import DATA_DIR
    cache_dir = DATA_DIR / "webdav_cache" / str(source_id)
    cache_dir.mkdir(parents=True, exist_ok=True)

    added=0; updated=0; skipped=0; errors=[]
    # mappa href->etag precedente
    etag_map = {e["href"]: e["etag"] for e in existing}
    for it in filtered:
        href = it["href"]
        fname = it["filename"]
        etag = it["etag"]
        prev_etag = etag_map.get(href, None)
        # se etag uguale e già indicizzato, skip (ma se non in documents, va reindicizzato)
        doc = get_document(fname)
        if prev_etag and prev_etag==etag and doc:
            skipped+=1
            continue
        # scarica
        dest = cache_dir / fname
        # evita collisione: se esiste già con etag diverso, sovrascrivi
        ok_dl, err = webdav_download(src["url"], href, src["username"], pw, str(dest))
        if not ok_dl:
            errors.append(f"{fname}: download fallito — {err}")
            continue
        # processa
        try:
            content = process_document(str(dest))
            if not content or not content.strip():
                errors.append(f"{fname}: nessun testo estraibile")
                continue
            meta = get_document_metadata(str(dest))
            # sovrascrivi filename/extension/size con valori reali
            doc_id = fname.replace(" ", "_").lower()
            # rimuovi vecchio indice se presente
            if doc:
                remove_document_from_store(doc_id)
            add_document_to_store(doc_id, content, meta)
            add_document(fname, str(dest), meta["extension"], meta["size_bytes"])
            try: auto_tag_document(fname, str(dest))
            except: pass
            if prev_etag is None or not doc:
                added+=1
            else:
                updated+=1
            # aggiorna etag dopo successo
            upsert_webdav_file(source_id, href, fname, etag, it["size_bytes"], it["last_modified"], it["content_type"], 0)
            log_activity("webdav_synced", fname, etag)
        except Exception as e:
            errors.append(f"{fname}: {e}")
    status = f"ok: +{added} ~{updated} -{deleted_count} skip:{skipped} err:{len(errors)}"
    update_webdav_sync_status(source_id, status)
    return {"added": added, "updated": updated, "deleted": deleted_count, "skipped": skipped, "errors": errors, "status": status, "total_remote": len(filtered)}

@router.post("/sync")
async def sync_source(payload: dict):
    """Sync una sorgente. Body: {source_id} o {name}. Query ?all=1 per tutte."""
    source_id = payload.get("source_id") or payload.get("id")
    name = payload.get("name")
    max_files = int(payload.get("max_files") or 100)
    # sync all?
    if payload.get("all"):
        results=[]
        for src in get_webdav_sources():
            r = _sync_one_source(src["id"], max_files=max_files)
            results.append({"source": src["name"], "id": src["id"], **r})
        return {"results": results}
    if source_id:
        src = get_webdav_source(source_id=int(source_id))
        if not src:
            raise HTTPException(status_code=404, detail="Sorgente non trovata")
        result = _sync_one_source(int(source_id), max_files=max_files)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return {"source_id": int(source_id), **result}
    if name:
        src = get_webdav_source(name=name)
        if not src:
            raise HTTPException(status_code=404, detail="Sorgente non trovata")
        result = _sync_one_source(int(src["id"]), max_files=max_files)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return {"source_id": int(src["id"]), **result}
    raise HTTPException(status_code=400, detail="source_id o name richiesto")

@router.post("/sync/{source_id}")
async def sync_by_id(source_id: int, max_files: int = 100):
    src = get_webdav_source(source_id=source_id)
    if not src:
        raise HTTPException(status_code=404, detail="Sorgente non trovata")
    result = _sync_one_source(source_id, max_files=max_files)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return {"source_id": source_id, **result}

# Compat: alias per test
@router.get("/test-connection")
async def test_connection_get(url: str, username: str, password: str):
    ok, msg = webdav_test_connection(url, username, password)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "ok", "normalized_url": msg}
