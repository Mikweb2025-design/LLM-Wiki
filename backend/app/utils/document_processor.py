"""Processamento documenti per estrazione testo"""
import os
import threading
import time
from pathlib import Path

# Cache del testo estratto. Key = path, value = (mtime, ts, text)
# Invalidazione: se mtime del file cambia, ricomputiamo.
# TTL hard: 30 min — protegge da file rimossi senza notifica.
_PROC_CACHE: dict = {}
_PROC_CACHE_LOCK = threading.Lock()
_PROC_CACHE_TTL = 1800.0
_PROC_CACHE_MAX = 256


def _cache_get(file_path: str):
    try:
        mtime = os.path.getmtime(file_path)
    except OSError:
        return None
    with _PROC_CACHE_LOCK:
        hit = _PROC_CACHE.get(file_path)
        if hit and hit[0] == mtime and (time.monotonic() - hit[1]) < _PROC_CACHE_TTL:
            return hit[2]
    return None


def _cache_put(file_path: str, text: str):
    try:
        mtime = os.path.getmtime(file_path)
    except OSError:
        return
    with _PROC_CACHE_LOCK:
        if len(_PROC_CACHE) >= _PROC_CACHE_MAX:
            # rimuovi l'entry più vecchia
            oldest = min(_PROC_CACHE, key=lambda k: _PROC_CACHE[k][1])
            _PROC_CACHE.pop(oldest, None)
        _PROC_CACHE[file_path] = (mtime, time.monotonic(), text)


def invalidate_processor_cache() -> None:
    with _PROC_CACHE_LOCK:
        _PROC_CACHE.clear()


def extract_text_from_pdf(file_path: str) -> str:
    """Estrae testo da file PDF (con OCR per scansioni immagini)"""
    try:
        from pypdf import PdfReader
        text = ""
        reader = PdfReader(file_path)
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text and page_text.strip():
                text += page_text + "\n"

        # Se non c'è testo, prova con OCR via PNG temp esplicito
        # (passare PIL.Image diretto a pytesseract crea PPM in TMPDIR che alcuni
        # sandbox rifiutano — salvare come PNG su path noto è molto più affidabile).
        if not text.strip():
            try:
                import pytesseract
                import tempfile
                from pdf2image import convert_from_path
                images = convert_from_path(file_path, dpi=200)
                with tempfile.TemporaryDirectory(prefix="llmwiki_ocr_") as td:
                    for i, image in enumerate(images):
                        png_path = os.path.join(td, f"page_{i}.png")
                        image.save(png_path, "PNG")
                        try:
                            text += pytesseract.image_to_string(png_path, lang='ita+eng') + "\n"
                        except Exception as inner:
                            print(f"[WARN] OCR pagina {i} ({file_path}): {inner}")
            except Exception as e:
                print(f"[WARN] OCR PDF fallito ({file_path}): {e}")

        return text.strip() if text.strip() else ""
    except Exception as e:
        raise ValueError(f"Errore lettura PDF: {str(e)}")


def extract_text_from_excel(file_path: str) -> str:
    """Estrae dati da file Excel"""
    try:
        import openpyxl
        text = ""
        wb = openpyxl.load_workbook(file_path, data_only=True)
        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            for row in ws.iter_rows(values_only=True):
                row_cells = [str(cell) for cell in row if cell is not None]
                text += " | ".join(row_cells) + "\n"
        wb.close()
        return text.strip()
    except Exception as e:
        raise ValueError(f"Impossibile leggere il file Excel: {str(e)}")


def extract_text_from_docx(file_path: str) -> str:
    """Estrae testo da file Word"""
    try:
        from docx import Document
        doc = Document(file_path)
        text = "\n".join(paragraph.text for paragraph in doc.paragraphs)
        return text.strip()
    except Exception as e:
        raise ValueError(f"Errore lettura Word: {str(e)}")


def extract_text_from_image(file_path: str) -> str:
    """OCR su immagini singole (PNG/JPG/...). Ritorna stringa vuota se OCR non disponibile.
    Passa il path direttamente a pytesseract — non l'oggetto PIL — per evitare
    problemi con TMPDIR sandboxati."""
    try:
        import pytesseract
        return pytesseract.image_to_string(file_path, lang='ita+eng').strip()
    except Exception as e:
        print(f"[WARN] OCR immagine fallito ({file_path}): {e}")
        return ""


def process_document(file_path: str) -> str:
    """Processa diversi tipi di file. Cache TTL + invalidazione su mtime."""
    cached = _cache_get(file_path)
    if cached is not None:
        return cached

    ext = Path(file_path).suffix.lower()

    if ext in [".xlsx", ".xls"]:
        text = extract_text_from_excel(file_path)
    elif ext == ".pdf":
        text = extract_text_from_pdf(file_path)
    elif ext == ".docx":
        text = extract_text_from_docx(file_path)
    elif ext == ".txt":
        with open(file_path, 'r', encoding='utf-8') as f:
            text = f.read()
    elif ext in [".png", ".jpg", ".jpeg", ".gif", ".tiff", ".bmp"]:
        # OCR diretto su immagini (prima il content endpoint le leggeva come testo
        # binario sporco, da qui il "Confronta" non funzionava su WhatsApp-screenshot)
        text = extract_text_from_image(file_path)
    else:
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                text = f.read()
        except Exception:
            raise ValueError(f"Formato non supportato: {ext}")

    _cache_put(file_path, text)
    return text



def get_document_metadata(file_path: str) -> dict:
    """Ottiene metadati documento"""
    path = Path(file_path)
    
    return {
        "filename": path.name,
        "extension": path.suffix.lower(),
        "size_bytes": path.stat().st_size,
        "modified": path.stat().st_mtime,
        "created": path.stat().st_ctime,
        "dir": str(path.parent)
    }


def scan_documents_directory(directory: str = None) -> list:
    """Scansiona cartella per documenti supportati"""
    from app.config import DOCUMENTS_DIR
    
    directory = directory or str(DOCUMENTS_DIR)
    
    supported_extensions = {
        '.pdf', '.docx', '.xlsx', '.xls', '.txt',
        '.jpg', '.jpeg', '.png', '.gif', '.tiff', '.bmp',
        '.rtf', '.html', '.md', '.csv'
    }
    
    files = []
    for root, _, filenames in os.walk(directory):
        for filename in filenames:
            path = Path(root) / filename
            ext = path.suffix.lower()
            if ext in supported_extensions:
                files.append(str(path))
    
    return files


def scan_custom_directory(directory: str) -> list:
    """Scansiona cartella personalizzata"""
    if not directory:
        raise ValueError("Directory mancante")
    
    return scan_documents_directory(directory)
