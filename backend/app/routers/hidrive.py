"""Router HiDrive — login OAuth + folder picker + sync incrementale (mirror Nextcloud/WebDAV).

Flusso UI (tab Cartelle, pannello HiDrive):
  1. Collega: POST /api/hidrive/connect {code?, redirect_uri?}
     - con `code` (prima volta): scambia authorization_code -> refresh_token, come
       POST /api/documents/hidrive/exchange ma restituisce anche il listing root
       per il picker (mirror di POST /api/webdav/connect).
     - senza `code`: riusa il token salvato, verifica e restituisce il picker.
  2. Sfoglia: GET /api/hidrive/browse?path=/ (mirror di GET /api/webdav/folders)
  3. Aggiungi cartella: POST /api/hidrive/folders {remote_path, name?}
  4. Sync: POST /api/hidrive/sync {folder_id} / {all:true} (mirror webdav sync,
     tracking su mtime invece che ETag; i file cancellati su HiDrive escono dall'indice)
"""
import os
import threading
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.config import DATA_DIR
from app.utils.database import (
    add_hidrive_folder, get_hidrive_folders, get_hidrive_folder,
    remove_hidrive_folder, update_hidrive_sync_status, update_hidrive_folder,
    upsert_hidrive_file, get_hidrive_files, delete_hidrive_file,
    add_document, remove_document, get_document,
    log_activity,
)
from app.utils import hidrive_client as hd
from app.utils.document_processor import process_document, get_document_metadata
from app.utils.vector_store import add_document_to_store, remove_document_from_store
from app.utils.auto_tagger import auto_tag_document

router = APIRouter(prefix="/api/hidrive", tags=["hidrive"])

# Una sola sync alla volta (manuale o auto-sync daemon). Come il 409 degli scan.
_sync_lock = threading.Lock()


def _to_picker_item(m: dict) -> dict:
    """Item in forma compatibile col picker WebDAV del frontend."""
    return {
        "href": m["path"],
        "filename": m["name"],
        "is_collection": 1 if m["is_dir"] else 0,
        "size_bytes": m.get("size", 0),
        "mtime": m.get("mtime", 0),
    }


@router.get("/status")
async def hidrive_status():
    """Stato connessione (mai segreti) + cartelle monitorate."""
    st = hd.hidrive_status()
    account = None
    connected = False
    msg = st.get("config_error") or "Refresh token mancante: collega HiDrive qui sotto"
    if st["configured"] and st["has_refresh_token"]:
        connected, msg = hd.check_connection()
        if connected and msg.startswith("Connesso"):
            # "Connesso (account: X)" -> X
            account = msg.split("account:", 1)[-1].strip().rstrip(")")
    folders = get_hidrive_folders()
    return {
        "configured": st["configured"],
        "connected": connected,
        "account": account,
        "connection_message": msg,
        "folders": folders,
        "folder_count": len(folders),
    }


@router.post("/connect")
async def hidrive_connect(payload: dict):
    """Login HiDrive + listing root per il picker (mirror webdav connect).

    Body: {code?, redirect_uri?} — `code` solo al primo login (dopo aver
    aperto l'authorize URL). Senza `code` verifica il token esistente.
    """
    ok, cfg_err = hd.is_configured()
    if not ok:
        raise HTTPException(status_code=400, detail=cfg_err)
    code = (payload.get("code") or "").strip()
    redirect_uri = (payload.get("redirect_uri") or "https://migration.mikweb.eu/api/oauth/callback").strip()
    if code:
        ok_ex, msg_ex = hd.exchange_code(code, redirect_uri=redirect_uri)
        if not ok_ex:
            raise HTTPException(status_code=400, detail=msg_ex)
    elif not hd._seeded_refresh_token():
        # niente code e niente token: serve l'authorize URL
        return {
            "status": "need_code",
            "authorize_url": hd.authorize_url(redirect_uri=redirect_uri),
            "message": "Apri authorize_url nel browser, autorizza e ripeti con il code",
        }
    connected, msg = hd.check_connection()
    if not connected:
        raise HTTPException(status_code=400, detail=msg)
    ok_l, err_l, items = hd.list_dir("/")
    folders = [_to_picker_item(m) for m in items if m["is_dir"]] if ok_l else []
    files = [_to_picker_item(m) for m in items if not m["is_dir"] and hd.is_supported_file(m["name"])] if ok_l else []
    log_activity("hidrive_connected", details=msg)
    return {
        "status": "connected",
        "account": msg,
        "picker_path": "/",
        "folders": folders,
        "files": files,
        "picker_error": None if ok_l else err_l,
    }


@router.get("/browse")
async def hidrive_browse(path: str = "/"):
    """Sfoglia un path HiDrive per il picker (mirror webdav folders)."""
    ok, err, items = hd.list_dir(path)
    if not ok:
        raise HTTPException(status_code=400, detail=err)
    all_items = [_to_picker_item(m) for m in items]
    return {
        "path": path,
        "folders": [x for x in all_items if x["is_collection"]],
        "files": [x for x in all_items if not x["is_collection"] and hd.is_supported_file(x["filename"])],
        "all": all_items,
    }


@router.get("/folders")
async def hidrive_list_folders():
    """Cartelle HiDrive monitorate (mirror webdav sources)."""
    return {"folders": get_hidrive_folders()}


@router.post("/folders")
async def hidrive_add_folder(payload: dict):
    """Aggiunge una cartella HiDrive da indicizzare (mirror webdav add-folder).

    Body: {remote_path, name?}
    """
    remote_path = (payload.get("remote_path") or "/").strip() or "/"
    name = (payload.get("name") or "").strip()
    if not name:
        segs = [s for s in remote_path.strip("/").split("/") if s]
        name = segs[-1] if segs else "hidrive-root"
        name = f"hidrive/{name}"
    # verifica che il path esista davvero
    ok, err, _ = hd.list_dir(remote_path)
    if not ok:
        raise HTTPException(status_code=400, detail=err)
    folder_id = add_hidrive_folder(name, remote_path)
    return {"status": "added", "folder_id": folder_id, "name": name, "remote_path": remote_path}


@router.delete("/folders/{folder_id}")
async def hidrive_delete_folder(folder_id: int):
    """Rimuove una cartella monitorata (i documenti già indicizzati restano)."""
    ok = remove_hidrive_folder(folder_id)
    if not ok:
        raise HTTPException(status_code=500, detail="Errore eliminazione")
    return {"status": "deleted", "folder_id": folder_id}


@router.get("/files")
async def hidrive_indexed_files(folder_id: int):
    f = get_hidrive_folder(folder_id=folder_id)
    if not f:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    files = get_hidrive_files(folder_id)
    return {"folder_id": folder_id, "count": len(files), "files": files}


def _sync_one_folder(folder_id: int, max_files: int = 100) -> dict:
    """Sync sincrono di una cartella: lista, download nuovi/modificati (mtime),
    rimuove dall'indice i file cancellati su HiDrive."""
    f = get_hidrive_folder(folder_id=folder_id)
    if not f:
        return {"error": "Cartella non trovata"}
    remote_path = f.get("remote_path") or "/"
    ok, err, items = hd.list_dir(remote_path)
    if not ok:
        update_hidrive_sync_status(folder_id, f"error: {err}")
        return {"error": err}
    filtered = [it for it in items if not it["is_dir"] and hd.is_supported_file(it["name"])]
    filtered = filtered[:max_files]

    for it in filtered:
        upsert_hidrive_file(folder_id, it["path"], it["name"], it["mtime"], it["size"], it.get("chash", ""))

    # file non più presenti su HiDrive -> rimuovi da indice
    existing = get_hidrive_files(folder_id)
    current_paths = {it["path"] for it in filtered}
    deleted_count = 0
    for ent in existing:
        if ent["path"] in current_paths:
            continue
        fname = ent["filename"]
        doc = get_document(fname)
        if doc:
            try:
                remove_document_from_store(fname.replace(" ", "_").lower())
                remove_document(fname)
                fp = doc.get("file_path")
                if fp and Path(fp).exists():
                    try:
                        os.remove(fp)
                    except OSError:
                        pass
            except Exception as e:
                print(f"[WARN] delete removed hidrive file {fname}: {e}")
        delete_hidrive_file(folder_id, ent["path"])
        deleted_count += 1
        log_activity("hidrive_deleted", fname, ent["path"])

    cache_dir = DATA_DIR / "hidrive_cache" / str(folder_id)
    cache_dir.mkdir(parents=True, exist_ok=True)

    mtime_map = {e["path"]: (e["mtime"] or 0) for e in existing}
    added = 0
    updated = 0
    skipped = 0
    errors = []
    for it in filtered:
        fpath = it["path"]
        fname = it["name"]
        remote_mtime = it["mtime"] or 0.0
        prev_mtime = mtime_map.get(fpath, 0) or 0
        doc = get_document(fname)
        if doc and remote_mtime and prev_mtime and remote_mtime <= prev_mtime + 1:
            skipped += 1
            continue
        dest = cache_dir / fname
        ok_dl, dl_err = hd.download_file(fpath, str(dest))
        if not ok_dl:
            errors.append(f"{fname}: download fallito — {dl_err}")
            continue
        if remote_mtime:
            try:
                os.utime(dest, (remote_mtime, remote_mtime))
            except OSError:
                pass
        try:
            content = process_document(str(dest))
            if not content or not content.strip():
                errors.append(f"{fname}: nessun testo estraibile")
                continue
            meta = get_document_metadata(str(dest))
            doc_id = fname.replace(" ", "_").lower()
            if doc:
                remove_document_from_store(doc_id)
            add_document_to_store(doc_id, content, meta)
            add_document(fname, str(dest), meta["extension"], meta["size_bytes"])
            try:
                auto_tag_document(fname, str(dest))
            except Exception:
                pass
            if doc and prev_mtime:
                updated += 1
            else:
                added += 1
            upsert_hidrive_file(folder_id, fpath, fname, remote_mtime, it["size"], it.get("chash", ""))
            log_activity("hidrive_synced", fname, fpath)
        except Exception as e:
            errors.append(f"{fname}: {e}")
    status = f"ok: +{added} ~{updated} -{deleted_count} skip:{skipped} err:{len(errors)}"
    update_hidrive_sync_status(folder_id, status)
    return {
        "added": added, "updated": updated, "deleted": deleted_count,
        "skipped": skipped, "errors": errors, "status": status,
        "total_remote": len(filtered),
    }


@router.post("/sync")
async def hidrive_sync(payload: dict):
    """Sync una cartella ({folder_id} o {name}) oppure tutte ({all:true})."""
    max_files = int(payload.get("max_files") or 100)
    if not _sync_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Sync già in corso (manuale o automatico)")
    try:
        if payload.get("all"):
            results = []
            for f in get_hidrive_folders():
                r = _sync_one_folder(f["id"], max_files=max_files)
                results.append({"folder": f["name"], "id": f["id"], **r})
            return {"results": results}
        folder_id = payload.get("folder_id") or payload.get("id")
        name = payload.get("name")
        target = None
        if folder_id:
            target = get_hidrive_folder(folder_id=int(folder_id))
        elif name:
            target = get_hidrive_folder(name=name)
        if not target:
            raise HTTPException(status_code=404, detail="Cartella non trovata (folder_id o name richiesto)")
        result = _sync_one_folder(int(target["id"]), max_files=max_files)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return {"folder_id": int(target["id"]), **result}
    finally:
        _sync_lock.release()


@router.post("/sync/{folder_id}")
async def hidrive_sync_by_id(folder_id: int, max_files: int = 100):
    f = get_hidrive_folder(folder_id=folder_id)
    if not f:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    if not _sync_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Sync già in corso (manuale o automatico)")
    try:
        result = _sync_one_folder(folder_id, max_files=max_files)
    finally:
        _sync_lock.release()
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return {"folder_id": folder_id, **result}


@router.put("/folders/{folder_id}")
async def hidrive_update_folder(folder_id: int, payload: dict):
    """Aggiorna intervallo auto-sync (minuti, min 5) e/o flag active."""
    from app.utils.database import update_hidrive_folder as _upd
    f = get_hidrive_folder(folder_id=folder_id)
    if not f:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    interval = payload.get("sync_interval_minutes")
    active = payload.get("active")
    if interval is None and active is None:
        raise HTTPException(status_code=400, detail="sync_interval_minutes o active richiesto")
    try:
        interval = None if interval is None else int(interval)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="sync_interval_minutes non valido")
    ok = _upd(folder_id, sync_interval_minutes=interval, active=active)
    if not ok:
        raise HTTPException(status_code=500, detail="Errore aggiornamento")
    return {"status": "updated", **get_hidrive_folder(folder_id=folder_id)}
