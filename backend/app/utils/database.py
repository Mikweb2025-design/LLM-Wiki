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
    """Inizializza il database con tutte le tabelle"""
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
    conn.commit()
    conn.close()


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
