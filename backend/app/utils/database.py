"""Gestione database SQLite con connection pooling e activity tracking"""
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

from app.config import DB_PATH

# Connection pool (thread-safe, one connection per thread)
_pool = threading.local()


def get_db_connection():
    """Ottiene connessione riutilizzabile al database (una per thread)"""
    if not hasattr(_pool, "conn") or _pool.conn is None:
        _pool.conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        _pool.conn.row_factory = sqlite3.Row
        _pool.conn.execute("PRAGMA journal_mode=WAL")
        _pool.conn.execute("PRAGMA synchronous=NORMAL")
    return _pool.conn


def _run(conn, sql: str, params=()):
    """Esegue una query con gestione errori."""
    try:
        cursor = conn.cursor()
        cursor.execute(sql, params)
        return cursor
    except Exception:
        raise


def init_db():
    """Inizializza il database con tutte le tabelle + indici performance."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT UNIQUE NOT NULL,
            file_path TEXT NOT NULL,
            extension TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            indexed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_message TEXT NOT NULL,
            assistant_message TEXT NOT NULL,
            model TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            path TEXT NOT NULL,
            active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            target TEXT,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Nuove tabelle: tags/favorites
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS document_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            tag TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(filename, tag),
            FOREIGN KEY(filename) REFERENCES documents(filename) ON DELETE CASCADE
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS document_favorites (
            filename TEXT PRIMARY KEY,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(filename) REFERENCES documents(filename) ON DELETE CASCADE
        )
    """)
    # Indici per performance (query frequenti)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_documents_extension ON documents(extension)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_history(created_at DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tags_filename ON document_tags(filename)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tags_tag ON document_tags(tag)")
    conn.commit()
    # Migrazione: se DB vecchio senza nuove tabelle, ignora errori FK
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
    except Exception:
        pass


def log_activity(action: str, target: str = None, details: str = None):
    """Registra un'attivita' nel log"""
    try:
        conn = get_db_connection()
        conn.execute(
            "INSERT INTO activity_log (action, target, details) VALUES (?, ?, ?)",
            (action, target, details)
        )
        conn.commit()
    except Exception:
        pass


def get_activity_log(limit: int = 20) -> List[Dict]:
    """Ottiene le ultime attivita' registrate"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    return [dict(row) for row in rows]


def add_document(filename: str, file_path: str, extension: str, size_bytes: int) -> bool:
    """Aggiunge documento al database"""
    try:
        conn = get_db_connection()
        conn.execute(
            "INSERT OR REPLACE INTO documents (filename, file_path, extension, size_bytes, indexed_at) VALUES (?, ?, ?, ?, ?)",
            (filename, file_path, extension, size_bytes, datetime.now().isoformat())
        )
        conn.commit()
        log_activity("document_added", filename, f"{extension} {size_bytes}B")
        return True
    except Exception:
        return False


def remove_document(filename: str) -> bool:
    """Rimuove documento dal database"""
    try:
        conn = get_db_connection()
        conn.execute("DELETE FROM documents WHERE filename = ?", (filename,))
        conn.commit()
        log_activity("document_removed", filename)
        return True
    except Exception:
        return False


def get_document(filename: str) -> Optional[Dict]:
    """Ottiene informazioni documento"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents WHERE filename = ?", (filename,))
    row = cursor.fetchone()
    if row:
        return dict(row)
    return None


def is_document_indexed(filename: str) -> bool:
    """Verifica se un documento e' gia' indicizzato"""
    return get_document(filename) is not None


def get_all_documents() -> List[Dict]:
    """Lista tutti i documenti"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents ORDER BY created_at DESC")
    rows = cursor.fetchall()
    return [dict(row) for row in rows]


def get_documents_paginated(offset: int = 0, limit: int = 50) -> List[Dict]:
    """Lista documenti con paginazione"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents ORDER BY created_at DESC LIMIT ? OFFSET ?", (limit, offset))
    rows = cursor.fetchall()
    return [dict(row) for row in rows]


def get_document_count() -> int:
    """Conta documenti indicizzati"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as count FROM documents")
    count = cursor.fetchone()["count"]
    return count


def get_total_size() -> int:
    """Somma dimensione di tutti i documenti"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COALESCE(SUM(size_bytes), 0) as total FROM documents")
    return cursor.fetchone()["total"]


def get_total_word_count() -> int:
    """Stima conteggio parole totale (media ~500 parole per 1KB di testo estraibile)"""
    total = get_total_size()
    # Approximate: 1KB ~ 500 words for typical text documents
    return int(total / 1024 * 500)


def save_chat_message(user_message: str, assistant_message: str, model: str):
    """Salva messaggio chat nella cronologia"""
    conn = get_db_connection()
    conn.execute(
        "INSERT INTO chat_history (user_message, assistant_message, model) VALUES (?, ?, ?)",
        (user_message, assistant_message, model)
    )
    conn.commit()
    log_activity("chat", target=user_message[:100], details=model)


def get_chat_history(limit: int = 50) -> List[Dict]:
    """Ottiene cronologia chat"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM chat_history ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    return [dict(row) for row in rows]


def add_folder(path: str, name: str) -> bool:
    """Aggiunge cartella monitorizzata"""
    try:
        conn = get_db_connection()
        conn.execute(
            "INSERT OR REPLACE INTO folders (name, path, active) VALUES (?, ?, 1)",
            (name, path)
        )
        conn.commit()
        log_activity("folder_added", name, path)
        return True
    except Exception:
        return False


def remove_folder(name: str) -> bool:
    """Rimuove cartella monitorizzata"""
    try:
        conn = get_db_connection()
        conn.execute("DELETE FROM folders WHERE name = ?", (name,))
        conn.commit()
        log_activity("folder_removed", name)
        return True
    except Exception:
        return False


def get_folders() -> List[Dict]:
    """Lista cartelle monitorizzate"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM folders ORDER BY name")
    rows = cursor.fetchall()
    return [dict(row) for row in rows]


def get_folder(name: str) -> Optional[Dict]:
    """Ottiene cartella specifica"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM folders WHERE name = ?", (name,))
    row = cursor.fetchone()
    if row:
        return dict(row)
    return None


# ---------------------------------------------------------------------------
# Aggregates veloci (usati da /stats senza caricare tutte le righe)
# ---------------------------------------------------------------------------

def get_stats_aggregates() -> Dict:
    """Ritorna aggregati per dashboard in 1-2 query invece di O(N) Python."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) as cnt, COALESCE(SUM(size_bytes),0) as total FROM documents")
    row = cur.fetchone()
    total_docs = row["cnt"] or 0
    total_size = row["total"] or 0
    cur.execute("SELECT extension as ext, COUNT(*) as c FROM documents GROUP BY extension ORDER BY c DESC")
    by_ext = [{"ext": r["ext"], "count": r["c"]} for r in cur.fetchall()]
    # recent 8 direttamente da SQL (evita fetch di 400 righe)
    cur.execute("SELECT * FROM documents ORDER BY created_at DESC LIMIT 8")
    recent = [dict(r) for r in cur.fetchall()]
    return {
        "total_documents": total_docs,
        "total_size_bytes": total_size,
        "total_words": int(total_size / 1024 * 500),
        "by_extension": by_ext,
        "recent": recent,
    }


# ---------------------------------------------------------------------------
# Tags / Favorites
# ---------------------------------------------------------------------------

def get_document_tags(filename: str) -> List[str]:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT tag FROM document_tags WHERE filename=? ORDER BY tag", (filename,))
    return [r["tag"] for r in cur.fetchall()]


def get_all_tags() -> List[Dict]:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT tag, COUNT(*) as count FROM document_tags GROUP BY tag ORDER BY count DESC")
    return [dict(r) for r in cur.fetchall()]


def add_tag(filename: str, tag: str) -> bool:
    tag = tag.strip().lower()[:30]
    if not tag:
        return False
    try:
        conn = get_db_connection()
        conn.execute("INSERT OR IGNORE INTO document_tags (filename, tag) VALUES (?, ?)", (filename, tag))
        conn.commit()
        log_activity("tag_added", filename, tag)
        return True
    except Exception:
        return False


def remove_tag(filename: str, tag: str) -> bool:
    try:
        conn = get_db_connection()
        conn.execute("DELETE FROM document_tags WHERE filename=? AND tag=?", (filename, tag))
        conn.commit()
        log_activity("tag_removed", filename, tag)
        return True
    except Exception:
        return False


def is_favorite(filename: str) -> bool:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM document_favorites WHERE filename=?", (filename,))
    return cur.fetchone() is not None


def toggle_favorite(filename: str) -> bool:
    """Toggle favorite, ritorna nuovo stato (True=favorite)."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM document_favorites WHERE filename=?", (filename,))
        if cur.fetchone():
            conn.execute("DELETE FROM document_favorites WHERE filename=?", (filename,))
            conn.commit()
            log_activity("unfavorited", filename)
            return False
        else:
            conn.execute("INSERT INTO document_favorites (filename) VALUES (?)", (filename,))
            conn.commit()
            log_activity("favorited", filename)
            return True
    except Exception:
        return False


def get_favorites() -> List[str]:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT filename FROM document_favorites ORDER BY created_at DESC")
    return [r["filename"] for r in cur.fetchall()]


def get_documents_by_tag(tag: str) -> List[Dict]:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT d.* FROM documents d
        JOIN document_tags t ON t.filename = d.filename
        WHERE t.tag = ?
        ORDER BY d.created_at DESC
    """, (tag.lower(),))
    return [dict(r) for r in cur.fetchall()]
