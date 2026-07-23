"""Gestione Vector Store con ChromaDB e Ollama Embeddings"""
import threading
import time
from typing import List, Dict, Optional
from langchain_chroma import Chroma
from langchain_ollama import OllamaEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import CHROMA_DIR, OLLAMA_BASE_URL

# Singleton pattern for vector store
_vector_store = None
_embeddings = None

# Cache della collection per la keyword search.
# Invalidata in add_document_to_store / remove_document_from_store.
# Senza questa cache, ogni query ricaricava TUTTI i chunk dal disco (O(N)).
_collection_cache: Optional[Dict] = None
_collection_cache_ts: float = 0.0
_collection_cache_ttl: float = 300.0  # 5 min hard ttl di sicurezza
_collection_lock = threading.Lock()


def get_embeddings():
    """Ottiene l'embedding model da Ollama (cached)"""
    global _embeddings
    if _embeddings is None:
        _embeddings = OllamaEmbeddings(
            model="nomic-embed-text",
            base_url=OLLAMA_BASE_URL,
        )
    return _embeddings


def get_vector_store():
    """Ottiene o crea il vector store (cached)"""
    global _vector_store
    if _vector_store is None:
        _vector_store = Chroma(
            persist_directory=str(CHROMA_DIR),
            embedding_function=get_embeddings(),
            collection_name="llm_wiki",
        )
    return _vector_store


def add_document_to_store(doc_id: str, content: str, metadata: Dict) -> List[str]:
    """Aggiunge un documento al vector store"""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_text(content)

    docs_with_metadata = []
    for i, chunk in enumerate(chunks):
        docs_with_metadata.append({
            "content": chunk,
            "metadata": {
                "doc_id": doc_id,
                "chunk_index": i,
                "filename": metadata.get("filename", ""),
                "extension": metadata.get("extension", ""),
            }
        })

    vector_store = get_vector_store()
    ids = vector_store.add_texts(
        texts=[doc["content"] for doc in docs_with_metadata],
        metadatas=[doc["metadata"] for doc in docs_with_metadata],
        ids=[f"{doc_id}_chunk_{i}" for i in range(len(chunks))],
    )
    _invalidate_collection_cache()
    return ids


def _invalidate_collection_cache() -> None:
    global _collection_cache, _collection_cache_ts
    with _collection_lock:
        _collection_cache = None
        _collection_cache_ts = 0.0


def _get_collection_snapshot() -> Dict:
    """Snapshot (lazily refreshed) di tutti i chunk per keyword search."""
    global _collection_cache, _collection_cache_ts
    now = time.monotonic()
    with _collection_lock:
        if _collection_cache is not None and (now - _collection_cache_ts) < _collection_cache_ttl:
            return _collection_cache
    # ricarica fuori dal lock (può essere lento)
    collection = get_vector_store()._collection
    data = collection.get(include=['documents', 'metadatas'])
    # precomputa lowercase una volta sola
    docs = data.get('documents') or []
    metas = data.get('metadatas') or []
    snapshot = {
        "documents": docs,
        "metadatas": metas,
        "documents_lower": [d.lower() if d else "" for d in docs],
    }
    with _collection_lock:
        _collection_cache = snapshot
        _collection_cache_ts = time.monotonic()
    return snapshot


def search_documents(query: str, n_results: int = 5) -> List[Dict]:
    """Cerca documenti rilevanti nel vector store (semantic + keyword)"""
    vector_store = get_vector_store()
    
    # 1. Ricerca semantica (embeddings)
    semantic_results = vector_store.similarity_search_with_score(query, k=n_results * 2)
    
    # 2. Ricerca per parola chiave (cache snapshot + lowercase precomputato)
    snapshot = _get_collection_snapshot()
    query_words = [w for w in query.lower().split() if len(w) >= 2]
    keyword_results = []

    for doc, doc_lower, meta in zip(
        snapshot["documents"], snapshot["documents_lower"], snapshot["metadatas"]
    ):
        if not doc_lower:
            continue
        # Conta quante parole della query sono nel documento (set per uniqueness)
        matches = sum(1 for word in query_words if word in doc_lower)
        if matches > 0:
            keyword_results.append({
                "content": doc,
                "score": -matches,  # Score negativo = priorità alta (più match = score più basso)
                "metadata": meta,
            })
    
    # Ordina per numero di match (score più basso = più match)
    keyword_results.sort(key=lambda x: x['score'])
    
    # 3. Unisci i risultati (keyword ha priorità)
    seen = set()
    combined = []
    
    # Prima i keyword results
    for r in keyword_results:
        chunk_id = r['metadata'].get('chunk_index', '') or r['content'][:50]
        if chunk_id not in seen:
            seen.add(chunk_id)
            combined.append(r)
    
    # Poi i semantic results
    for doc, score in semantic_results:
        chunk_id = doc.metadata.get('chunk_index', '') or doc.page_content[:50]
        if chunk_id not in seen:
            seen.add(chunk_id)
            combined.append({
                "content": doc.page_content,
                "score": float(score),
                "metadata": doc.metadata,
            })
    
    return combined[:n_results]


def remove_document_from_store(doc_id: str) -> bool:
    """Rimuove un documento dal vector store"""
    try:
        vector_store = get_vector_store()
        collection = vector_store._collection
        collection.delete(where={"doc_id": doc_id})
        _invalidate_collection_cache()
        return True
    except Exception:
        return False


def prewarm() -> None:
    """Inizializza vector store + embeddings + snapshot al boot.
    Senza questo, la prima chat paga tutto il cold start (~secondi)."""
    try:
        get_embeddings()
        get_vector_store()
        _get_collection_snapshot()
    except Exception as e:  # non bloccare il boot per problemi di prewarm
        print(f"[WARN] prewarm vector_store: {e}")


def get_store_stats() -> Dict:
    """Statistiche del vector store"""
    try:
        vector_store = get_vector_store()
        collection = vector_store._collection
        count = collection.count()
    except Exception:
        count = 0
    return {"total_chunks": count}