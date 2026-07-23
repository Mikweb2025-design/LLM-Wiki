"""API Router per Gestione Documenti"""
import os
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException

# Max file size: 50MB
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB in bytes
from app.config import DOCUMENTS_DIR
from app.models.schemas import UploadResponse, DocumentInfo, ScanResponse
from app.utils.document_processor import (
    process_document,
    scan_documents_directory,
    get_document_metadata,
)
from app.utils.vector_store import add_document_to_store, remove_document_from_store, search_documents
from app.utils.database import (
    add_document,
    remove_document,
    get_all_documents,
    get_document_count,
    is_document_indexed,
)

router = APIRouter(prefix="/api/documents", tags=["documents"], redirect_slashes=False)


@router.post("/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...)):
    """Carica un nuovo documento"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nome file mancante")

    # Check file size
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File troppo grande. Massimo {MAX_FILE_SIZE // (1024*1024)}MB")

    # Salva file leggendo il contenuto
    file_path = DOCUMENTS_DIR / file.filename
    if file_path.exists():
        base, ext = Path(file.filename).stem, Path(file.filename).suffix
        counter = 1
        while file_path.exists():
            file_path = DOCUMENTS_DIR / f"{base}_{counter}{ext}"
            counter += 1

    # Leggi e salva il contenuto
    content_bytes = await file.read()
    with open(file_path, "wb") as f:
        f.write(content_bytes)

    # Verifica che il file non sia vuoto
    file_size = file_path.stat().st_size
    if file_size == 0:
        raise HTTPException(status_code=400, detail="File vuoto ricevuto")

    # Processa documento
    try:
        extracted_text = process_document(str(file_path))
    except Exception as e:
        import traceback
        error_detail = f"Errore processamento: {str(e)}"
        try:
            error_detail = f"{str(e)}\n{traceback.format_exc()}"
        except:
            pass
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=400, detail=error_detail[:500])

    if not extracted_text or not extracted_text.strip():
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=400, detail="Nessun testo estratto. Il file potrebbe essere vuoto o protetto.")

    # Metadati
    metadata = get_document_metadata(str(file_path))
    metadata["size_bytes"] = file_size

    # Aggiungi al vector store
    doc_id = file.filename.replace(" ", "_").lower()
    chunks = add_document_to_store(doc_id, extracted_text, metadata)

    # Salva nel database
    add_document(file.filename, str(file_path), metadata["extension"], file_size)

    return UploadResponse(
        filename=file.filename,
        status="success",
        chunks_added=len(chunks),
        metadata=metadata,
    )


@router.get("/", response_model=list[DocumentInfo])
async def list_documents():
    """Lista tutti i documenti indicizzati"""
    docs = get_all_documents()
    result = []
    for doc in docs:
        result.append(DocumentInfo(
            filename=doc["filename"],
            extension=doc["extension"],
            size_bytes=doc["size_bytes"],
            modified=doc["created_at"],
            created=doc["created_at"],
            indexed=True,
        ))
    return result


@router.delete("/{filename}")
async def delete_document(filename: str):
    """Elimina un documento"""
    # Rimuovi da vector store
    doc_id = filename.replace(" ", "_").lower()
    remove_document_from_store(doc_id)

    # Rimuovi da database
    remove_document(filename)

    # Rimuovi file fisico
    file_path = DOCUMENTS_DIR / filename
    if file_path.exists():
        os.remove(file_path)

    return {"status": "deleted", "filename": filename}


@router.post("/scan", response_model=ScanResponse)
async def scan_directory():
    """Scansiona cartella documenti e indicizza nuovi file"""
    files = scan_documents_directory()
    new_files = 0
    already_indexed = 0
    errors = []

    for file_path in files:
        filename = os.path.basename(file_path)
        if is_document_indexed(filename):
            already_indexed += 1
            continue

        try:
            content = process_document(file_path)
            if not content.strip():
                errors.append(f"{filename}: nessun testo estratto")
                continue

            metadata = get_document_metadata(file_path)
            doc_id = filename.replace(" ", "_").lower()
            add_document_to_store(doc_id, content, metadata)
            add_document(filename, file_path, metadata["extension"], metadata["size_bytes"])
            new_files += 1
        except Exception as e:
            errors.append(f"{filename}: {str(e)}")

    return ScanResponse(
        scanned_files=len(files),
        new_files=new_files,
        already_indexed=already_indexed,
        errors=errors,
    )


@router.get("/count")
async def document_count():
    """Conta documenti indicizzati"""
    return {"count": get_document_count()}


@router.get("/search")
async def search_documents_endpoint(q: str = ""):
    """Ricerca nei documenti indicizzati"""
    from app.utils.vector_store import search_documents
    if not q:
        return {"results": []}
    
    results = search_documents(q, n_results=20)
    return {"results": results}


def _resolve_doc_path(filename: str) -> Path:
    """Risolve il path reale di un documento.
    Il DB salva `filename` come nome logico (ciò che vede l'utente) ma il
    `file_path` può differire (suffisso anti-collisione, oppure path esterno
    da /scan-custom). Quindi: prima cerca nel DB, poi fallback a DOCUMENTS_DIR.
    """
    from app.utils.database import get_document
    doc = get_document(filename)
    if doc and doc.get("file_path"):
        p = Path(doc["file_path"])
        if p.exists():
            return p
    fallback = DOCUMENTS_DIR / filename
    if fallback.exists():
        return fallback
    raise HTTPException(status_code=404, detail=f"File non trovato: {filename}")


@router.get("/preview/{filename}")
async def preview_file(filename: str):
    """Anteprima file - serve il file direttamente"""
    from fastapi.responses import FileResponse
    file_path = _resolve_doc_path(filename)
    return FileResponse(
        path=str(file_path),
        filename=filename,
    )


@router.get("/content/{filename}")
async def get_file_content(filename: str, max_length: int = 50000):
    """Ottiene il contenuto testuale di un documento.
    Restituisce sempre 200 con campi diagnostici (extractable, length, reason)
    così il frontend Compare può mostrare un avviso utile invece di un diff vuoto.
    max_length: limite massimo di caratteri da restituire (default 50KB)."""
    from app.utils.document_processor import process_document
    file_path = _resolve_doc_path(filename)  # legge file_path dal DB (gestisce suffissi anti-collisione)

    try:
        content = process_document(str(file_path))
    except Exception as e:
        # invece di 400, ritorniamo 200 con flag — UX migliore
        return {
            "filename": filename,
            "content": "",
            "length": 0,
            "extractable": False,
            "reason": f"Errore lettura: {e}",
        }

    original_length = len(content) if content else 0
    # Limita il contenuto per evitare risposte troppo grandi
    if original_length > max_length:
        content = content[:max_length] + f"\n\n[Contenuto troncato: mostrati primi {max_length} caratteri su {original_length}]"
    
    length = len(content) if content else 0
    ext = file_path.suffix.lower()
    reason = None
    if original_length == 0:
        if ext == ".pdf":
            reason = "PDF senza testo estraibile (probabile scansione/immagine). Installare tesseract+pdf2image per OCR."
        elif ext in {".png", ".jpg", ".jpeg", ".gif", ".tiff", ".bmp"}:
            reason = "OCR non disponibile o immagine senza testo riconoscibile."
        else:
            reason = "Contenuto vuoto."
    elif original_length > max_length:
        reason = f"Contenuto troncato a {max_length} caratteri per prestazioni."

    return {
        "filename": filename,
        "content": content,
        "length": length,
        "original_length": original_length,
        "extractable": original_length > 0,
        "reason": reason,
    }


@router.get("/summary/{filename}")
async def get_document_summary(filename: str, max_length: int = 500):
    """Genera un riassunto AI del documento"""
    from app.utils.document_processor import process_document
    from app.utils.llm_handler import chat_with_llm

    file_path = _resolve_doc_path(filename)

    try:
        content = process_document(str(file_path))
        if not content or not content.strip():
            raise HTTPException(status_code=400, detail="Nessun contenuto da riassumere")
        
        # Take first 4000 chars for summary
        preview = content[:4000]
        
        summary = chat_with_llm(
            f"Riassumi il seguente documento in massimo {max_length} caratteri. Fornisci i punti chiave in modo strutturato.",
            [{"content": preview, "metadata": {"filename": filename}}]
        )
        
        return {"filename": filename, "summary": summary, "original_length": len(content)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore generazione riassunto: {str(e)}")


_INSIGHTS_CACHE = {"ts": 0.0, "payload": None}
_INSIGHTS_TTL = 600.0  # 10 min — l'LLM call era 13s, troppo per ogni dashboard load


@router.get("/insights")
async def get_documents_insights(refresh: bool = False):
    """Genera insights AI sui documenti (cached 10min). `?refresh=1` per forzare."""
    import time as _t
    from app.utils.vector_store import search_documents
    from app.utils.llm_handler import chat_with_llm

    now = _t.monotonic()
    if not refresh and _INSIGHTS_CACHE["payload"] and (now - _INSIGHTS_CACHE["ts"]) < _INSIGHTS_TTL:
        return _INSIGHTS_CACHE["payload"]

    try:
        results = search_documents("*", n_results=50)
        if not results or len(results) == 0:
            payload = {"insights": "Nessun documento indicizzato", "documents_analyzed": 0, "cached": False}
            _INSIGHTS_CACHE.update(ts=now, payload=payload)
            return payload

        combined = "\n\n".join([r.get('content', '')[:500] for r in results[:10]])
        insights = chat_with_llm(
            "Analizza i seguenti estratti di documenti e fornisci: 1) Temi principali 2) Pattern ricorrenti 3) Suggerimenti di ricerca. Sii conciso.",
            [{"content": combined, "metadata": {"source": "multi-doc"}}]
        )
        payload = {
            "insights": insights,
            "documents_analyzed": min(10, len(results)),
            "cached": False,
            "generated_at": _t.time(),
        }
        _INSIGHTS_CACHE.update(ts=now, payload=payload)
        return payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore generazione insights: {str(e)}")


@router.get("/stats")
async def get_documents_stats():
    """Aggregate veloce per Dashboard — niente lista, solo conteggi.
    Evita di scaricare 399 righe quando servono solo gli aggregati."""
    from app.utils.vector_store import get_store_stats
    docs = get_all_documents() or []
    by_ext: dict = {}
    total_size = 0
    for d in docs:
        ext = (d.get("extension") or ".unknown").lower()
        by_ext[ext] = by_ext.get(ext, 0) + 1
        total_size += d.get("size_bytes") or 0
    by_ext_sorted = sorted(by_ext.items(), key=lambda kv: kv[1], reverse=True)
    return {
        "total_documents": len(docs),
        "total_chunks": get_store_stats().get("total_chunks", 0),
        "total_size_bytes": total_size,
        "by_extension": [{"ext": k, "count": v} for k, v in by_ext_sorted],
        "recent": docs[:8],  # solo gli ultimi 8 per la card "Documenti Recenti"
    }


@router.post("/reindex/{filename}")
async def reindex_document(filename: str):
    """Reindicizza un singolo documento"""
    from app.utils.document_processor import process_document, get_document_metadata
    
    file_path = DOCUMENTS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File non trovato")
    
    try:
        # Rimuovi da vector store
        doc_id = filename.replace(" ", "_").lower()
        remove_document_from_store(doc_id)
        
        # Riprocessa
        content = process_document(str(file_path))
        if not content or not content.strip():
            raise HTTPException(status_code=400, detail="Nessun testo estratto dal documento")
        
        # Metadati aggiornati
        metadata = get_document_metadata(str(file_path))
        
        # Reindicizza
        chunks = add_document_to_store(doc_id, content, metadata)
        
        return {
            "status": "success",
            "filename": filename,
            "chunks_added": len(chunks),
            "message": "Documento reindicizzato con successo"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore reindicizzazione: {str(e)}")


@router.post("/reindex-all")
async def reindex_all_documents():
    """Reindicizza tutti i documenti"""
    from app.utils.document_processor import process_document, get_document_metadata, scan_documents_directory
    
    files = scan_documents_directory()
    successes = 0
    errors = []
    
    for file_path in files:
        filename = os.path.basename(file_path)
        try:
            # Rimuovi da vector store
            doc_id = filename.replace(" ", "_").lower()
            remove_document_from_store(doc_id)
            
            # Riprocessa
            content = process_document(file_path)
            if not content or not content.strip():
                errors.append(f"{filename}: nessun testo estratto")
                continue
            
            # Metadati
            metadata = get_document_metadata(file_path)
            
            # Reindicizza
            add_document_to_store(doc_id, content, metadata)
            successes += 1
            
        except Exception as e:
            errors.append(f"{filename}: {str(e)}")
    
    return {
        "status": "completed",
        "total_files": len(files),
        "successes": successes,
        "errors": errors,
        "message": f"Reindicizzati {successes} documenti su {len(files)}"
    }

@router.post("/scan-custom")
async def scan_custom_directory_endpoint(payload: dict):
    """Scansiona una cartella personalizzata senza spostare i file"""
    from app.utils.document_processor import process_document, get_document_metadata, scan_custom_directory
    from fastapi import HTTPException
    
    directory_path = payload.get("directory")
    if not directory_path:
        raise HTTPException(status_code=400, detail="Percorso cartella mancante")
    
    try:
        files = scan_custom_directory(directory_path)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore scansione: {str(e)}")
    
    new_files = 0
    already_indexed = 0
    errors = []
    
    for file_path in files:
        filename = os.path.basename(file_path)
        
        if is_document_indexed(filename):
            already_indexed += 1
            continue
        
        try:
            content = process_document(file_path)
            if not content or not content.strip():
                errors.append(f"{filename}: nessun testo estratto")
                continue
            
            metadata = get_document_metadata(file_path)
            doc_id = filename.replace(" ", "_").lower()
            add_document_to_store(doc_id, content, metadata)
            add_document(filename, file_path, metadata["extension"], metadata["size_bytes"])
            new_files += 1
            
        except Exception as e:
            errors.append(f"{filename}: {str(e)}")
    
    return {
        "status": "completed",
        "scanned_files": len(files),
        "new_files": new_files,
        "already_indexed": already_indexed,
        "errors": errors,
        "message": f"Aggiunti {new_files} nuovi documenti. {already_indexed} già presenti."
    }


@router.get("/folders", response_model=list)
async def list_folders():
    """Lista le cartelle monitorizzate"""
    from app.utils.database import get_folders, add_folder as db_add_folder, remove_folder as db_remove_folder
    
    folders = get_folders()
    return [{"path": f["path"], "name": f["name"], "active": f.get("active", True)} for f in folders]


@router.post("/folders")
async def add_folder_endpoint(payload: dict):
    """Aggiunge una nuova cartella da monitorizzare"""
    from app.utils.database import add_folder as db_add_folder
    
    folder_path = payload.get("path")
    folder_name = payload.get("name", os.path.basename(folder_path))
    
    if not folder_path:
        raise HTTPException(status_code=400, detail="Percorso cartella mancante")
    
    from pathlib import Path
    path = Path(folder_path)
    if not path.exists() or not path.is_dir():
        raise HTTPException(status_code=400, detail="Cartella non valida")
    
    db_add_folder(folder_path, folder_name)
    return {"status": "added", "path": folder_path, "name": folder_name}


@router.delete("/folders/{folder_name}")
async def remove_folder_endpoint(folder_name: str):
    """Rimuove una cartella monitorizzata"""
    from app.utils.database import remove_folder as db_remove_folder
    
    db_remove_folder(folder_name)
    return {"status": "removed", "name": folder_name}


@router.post("/folders/{folder_name}/scan")
async def scan_folder_endpoint(folder_name: str):
    """Scansiona una cartella monitorizzata"""
    from app.utils.database import get_folders
    from app.utils.document_processor import process_document, get_document_metadata
    
    folders = get_folders()
    folder = next((f for f in folders if f["name"] == folder_name), None)
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    
    folder_path = folder["path"]
    from app.utils.document_processor import scan_custom_directory
    
    try:
        files = scan_custom_directory(folder_path)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    
    new_files = 0
    errors = []
    
    for file_path in files:
        filename = os.path.basename(file_path)
        if is_document_indexed(filename):
            continue
        
        try:
            content = process_document(file_path)
            if not content or not content.strip():
                errors.append(f"{filename}: nessun testo estratto")
                continue
            
            metadata = get_document_metadata(file_path)
            doc_id = filename.replace(" ", "_").lower()
            add_document_to_store(doc_id, content, metadata)
            add_document(filename, file_path, metadata["extension"], metadata["size_bytes"])
            new_files += 1
        except Exception as e:
            errors.append(f"{filename}: {str(e)}")
    
    return {
        "status": "completed",
        "scanned_files": len(files),
        "new_files": new_files,
        "errors": errors,
    }

@router.get("/folders/{folder_name}/files")
async def list_folder_files(folder_name: str):
    """Lista i file in una cartella monitorizzata"""
    from app.utils.database import get_folders
    from app.utils.document_processor import scan_custom_directory
    
    folders = get_folders()
    folder = next((f for f in folders if f["name"] == folder_name), None)
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    
    files = scan_custom_directory(folder["path"])
    return {"folder": folder_name, "count": len(files), "files": [os.path.basename(f) for f in files]}
