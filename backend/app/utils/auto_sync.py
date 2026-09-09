"""Auto-sync HiDrive in background (come lo scheduler di Clumoove, versione leggera).

Daemon thread: tick ogni 60s, sincronizza le cartelle HiDrive attive il cui
last_sync è più vecchio di sync_interval_minutes (default per-cartella 60,
fallback env HIDRIVE_SYNC_INTERVAL_MINUTES).

- HIDRIVE_AUTO_SYNC=0 (o interval default 0) = spento del tutto.
- Skip silenzioso se manca il refresh_token (login non ancora fatto).
- Una sola sync alla volta (stesso lock del sync manuale -> 409 se occupato).
- Mai crash: ogni eccezione finisce in last_status e il loop continua.
"""
import os
import threading
import time
from datetime import datetime

_started = False
_start_lock = threading.Lock()


def _auto_sync_enabled() -> bool:
    return (os.getenv("HIDRIVE_AUTO_SYNC", "1") or "1").strip() not in ("0", "false", "False", "off", "no")


def _default_interval() -> int:
    try:
        return max(0, int(os.getenv("HIDRIVE_SYNC_INTERVAL_MINUTES", "60") or 60))
    except ValueError:
        return 60


def _is_due(folder: dict, now: float) -> bool:
    try:
        interval = int(folder.get("sync_interval_minutes") or 0) or _default_interval()
    except (ValueError, TypeError):
        interval = _default_interval()
    if interval <= 0:
        return False
    last = folder.get("last_sync")
    if not last:
        return True
    try:
        last_ts = datetime.fromisoformat(str(last)).timestamp()
    except (ValueError, TypeError):
        return True
    return (now - last_ts) >= interval * 60


def tick() -> dict:
    """Un giro di sync sulle cartelle dovute. Ritorna riepilogo (usato anche dai test)."""
    from app.utils import hidrive_client as hd
    from app.utils.database import get_hidrive_folders
    from app.routers.hidrive import _sync_lock, _sync_one_folder

    summary = {"checked": 0, "synced": [], "skipped": 0}
    if not _auto_sync_enabled():
        return summary
    if not hd._seeded_refresh_token():
        return summary
    now = time.time()
    for folder in get_hidrive_folders():
        summary["checked"] += 1
        if not folder.get("active"):
            summary["skipped"] += 1
            continue
        if not _is_due(folder, now):
            summary["skipped"] += 1
            continue
        acquired = _sync_lock.acquire(blocking=False)
        if not acquired:
            summary["skipped"] += 1
            continue
        try:
            result = _sync_one_folder(int(folder["id"]))
            summary["synced"].append({"folder": folder["name"], **result})
        except Exception as e:
            from app.utils.database import update_hidrive_sync_status
            update_hidrive_sync_status(int(folder["id"]), f"error: auto-sync {e}")
            summary["synced"].append({"folder": folder["name"], "error": str(e)})
        finally:
            _sync_lock.release()
    return summary


def _daemon() -> None:
    while True:
        time.sleep(60)
        try:
            tick()
        except Exception as e:
            print(f"[WARN] hidrive auto-sync tick: {e}")


def start_auto_sync() -> bool:
    """Avvia il daemon (idempotente). Ritorna True se avviato ora."""
    global _started
    with _start_lock:
        if _started:
            return False
        _started = True
    if not _auto_sync_enabled():
        print("[INFO] hidrive auto-sync disabilitato (HIDRIVE_AUTO_SYNC=0)")
        return False
    t = threading.Thread(target=_daemon, daemon=True, name="hidrive-auto-sync")
    t.start()
    print(f"[INFO] hidrive auto-sync avviato (default ogni {_default_interval()} min)")
    return True
