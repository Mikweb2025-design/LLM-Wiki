"""Gestione database SQLite per tracciare documenti indicizzati"""
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

from app.config import DB_PATH


def get_db_connection():
    """Ottiene connessione al database"""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Inizializza il database"""
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
    conn.commit()
    conn.close()


def add_document(filename: str, file_path: str, extension: str, size_bytes: int) -> bool:
    """Aggiunge documento al database"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO documents (filename, file_path, extension, size_bytes, indexed_at) VALUES (?, ?, ?, ?, ?)",
            (filename, file_path, extension, size_bytes, datetime.now().isoformat())
        )
        conn.commit()
        conn.close()
        return True
    except Exception:
        return False


def remove_document(filename: str) -> bool:
    """Rimuove documento dal database"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM documents WHERE filename = ?", (filename,))
        conn.commit()
        conn.close()
        return True
    except Exception:
        return False


def get_document(filename: str) -> Optional[Dict]:
    """Ottiene informazioni documento"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents WHERE filename = ?", (filename,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None


def is_document_indexed(filename: str) -> bool:
    """Verifica se un documento è già indicizzato"""
    return get_document(filename) is not None


def get_all_documents() -> List[Dict]:
    """Lista tutti i documenti"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM documents ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_document_count() -> int:
    """Conta documenti indicizzati"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as count FROM documents")
    count = cursor.fetchone()["count"]
    conn.close()
    return count


def save_chat_message(user_message: str, assistant_message: str, model: str):
    """Salva messaggio chat nella cronologia"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO chat_history (user_message, assistant_message, model) VALUES (?, ?, ?)",
        (user_message, assistant_message, model)
    )
    conn.commit()
    conn.close()


def get_chat_history(limit: int = 50) -> List[Dict]:
    """Ottiene cronologia chat"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM chat_history ORDER BY created_at DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def add_folder(path: str, name: str) -> bool:
    """Aggiunge cartella monitorizzata"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO folders (name, path, active) VALUES (?, ?, 1)",
            (name, path)
        )
        conn.commit()
        conn.close()
        return True
    except Exception:
        return False


def remove_folder(name: str) -> bool:
    """Rimuove cartella monitorizzata"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM folders WHERE name = ?", (name,))
        conn.commit()
        conn.close()
        return True
    except Exception:
        return False


def get_folders() -> List[Dict]:
    """Lista cartelle monitorizzate"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM folders ORDER BY name")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_folder(name: str) -> Optional[Dict]:
    """Ottiene cartella specifica"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM folders WHERE name = ?", (name,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return None
