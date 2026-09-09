"""Gestione Vector Store con ChromaDB e IONOS/Ollama Embeddings"""
import threading
import time
from typing import List, Dict, Optional
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter

try:
    from langchain_core.embeddings import Embeddings as _LCEmbeddings
except ImportError:  # fallback per vecchie versioni langchain
    from langchain.embeddings.base import Embeddings as _LCEmbeddings

from app.config import (
    CHROMA_DIR,
    OLLAMA_BASE_URL,
    IONOS_API_KEY,
    IONOS_BASE_URL,
    IONOS_EMBED_MODEL,
    EMBED_PROVIDER,
)

# Singleton pattern for vector store
_vector_store = None
_embeddings = None

# Cache della collection per la keyword search.
# Invalidata in add_document_to_store / remove_document_from_store.
# Senza questa cache, ogni query ricaricava TUTTI i chunk dal disco (O(N)).
_collection_cache: Optional[Dict] = None
_collection_cache_ts: float = 0.0
_collection_cache_ttl: float = 600.0  # 10 min (era 5, aumentato per ridurre snapshot reload)
_collection_lock = threading.Lock()

# Cache risultati ricerca — evita re-embedding e RRF per query ripetute (Dashboard Insights, chat rapide)
_search_cache: Dict[str, tuple] = {}  # key -> (ts, result)
_search_cache_ttl: float = 300.0
_search_cache_max: int = 256
_search_cache_lock = threading.Lock()

# Cache query embedding — evita chiamata Ollama per stessa query
_query_emb_cache: Dict[str, tuple] = {}  # query_lower -> (ts, embedding)
_query_emb_ttl: float = 300.0
_query_emb_lock = threading.Lock()


class IonosEmbeddings(_LCEmbeddings):
    """Embedding via IONOS AI Model Hub (endpoint OpenAI-compatibile).

    Stessa interfaccia LangChain di OllamaEmbeddings, così il resto della
    pipeline RAG/RRF/Chroma non cambia. Supporta batch nativo.
    """

    def __init__(
        self,
        model: str = None,
        api_key: str = None,
        base_url: str = None,
        batch_size: int = 64,
        timeout: float = 60.0,
    ):
        import requests as _rq

        self.model = model or IONOS_EMBED_MODEL
        self.api_key = api_key or IONOS_API_KEY
        if not self.api_key:
            raise ValueError("IONOS_API_KEY mancante: impossibile usare gli embedding IONOS.")
        self.base_url = (base_url or IONOS_BASE_URL).rstrip("/")
        self.batch_size = max(1, int(batch_size))
        self.timeout = timeout
        self._session = _rq.Session()

    def _embed_batch(self, texts: List[str]) -> List[List[float]]:
        resp = self._session.post(
            f"{self.base_url}/embeddings",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json={"model": self.model, "input": texts},
            timeout=self.timeout,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"IONOS embeddings errore {resp.status_code}: {resp.text[:300]}")
        data = resp.json().get("data", [])
        # ordina per index (il server dovrebbe già farlo)
        data.sort(key=lambda e: e.get("index", 0))
        return [e["embedding"] for e in data]

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        out: List[List[float]] = []
        clean = [(t if isinstance(t, str) else str(t or "")) for t in texts]
        for start in range(0, len(clean), self.batch_size):
            out.extend(self._embed_batch(clean[start:start + self.batch_size]))
        return out

    def embed_query(self, text: str) -> List[float]:
        return self._embed_batch([text if isinstance(text, str) else str(text or "")])[0]


def get_embeddings():
    """Ottiene l'embedding model configurato (cached).

    Provider selezionato da EMBED_PROVIDER ("ionos" di default se
    IONOS_API_KEY è impostata, "ollama" legacy altrimenti). Stessa firma di
    prima: nessun chiamante della pipeline RAG deve cambiare.
    """
    global _embeddings
    if _embeddings is None:
        if EMBED_PROVIDER == "ionos":
            _embeddings = IonosEmbeddings()
        else:
            from langchain_ollama import OllamaEmbeddings
            _embeddings = OllamaEmbeddings(
                model="nomic-embed-text",
                base_url=OLLAMA_BASE_URL,
            )
    return _embeddings


def reset_embeddings_cache() -> None:
    """Resetta i singleton embedding/vector-store (usato per re-indicizzazione
    dopo cambio modello: i vettori vecchi hanno dimensione diversa)."""
    global _embeddings, _vector_store, _collection_cache, _collection_cache_ts
    with _collection_lock:
        _collection_cache = None
        _collection_cache_ts = 0.0
    with _search_cache_lock:
        _search_cache.clear()
    with _query_emb_lock:
        _query_emb_cache.clear()
    _embeddings = None
    _vector_store = None


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


def add_document_to_store(doc_id: str, content: str, metadata: Dict, batch_size: int = 32) -> List[str]:
    """Aggiunge un documento al vector store (batched). Supporta page-aware per Citations 2.0."""
    # Se metadata contiene 'pages' (lista {page, text}) → chunk per pagina preservando page number
    pages = metadata.get("pages")
    if pages and isinstance(pages, list) and len(pages) > 0:
        # chunk per pagina separatamente per tenere page corretto su ogni chunk
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000, chunk_overlap=200, separators=["\n\n", "\n", ". ", " ", ""],
        )
        all_chunks = []
        all_metas = []
        for p in pages:
            pg_num = p.get("page", 1)
            pg_text = (p.get("text") or "").strip()
            if not pg_text:
                continue
            chunks = splitter.split_text(pg_text)
            for idx, ch in enumerate(chunks):
                all_chunks.append(ch)
                all_metas.append({
                    "doc_id": doc_id,
                    "chunk_index": len(all_metas),
                    "filename": metadata.get("filename", ""),
                    "extension": metadata.get("extension", ""),
                    "page": pg_num,
                    "page_source": p.get("source", "text"),
                })
        if not all_chunks:
            # fallback a content globale
            pages = None
        else:
            vector_store = get_vector_store()
            all_ids: List[str] = []
            for start in range(0, len(all_chunks), batch_size):
                batch_chunks = all_chunks[start:start + batch_size]
                batch_meta = all_metas[start:start + batch_size]
                batch_ids = [f"{doc_id}_chunk_{meta['chunk_index']}" for meta in batch_meta]
                ids = vector_store.add_texts(texts=batch_chunks, metadatas=batch_meta, ids=batch_ids)
                all_ids.extend(ids)
            _invalidate_collection_cache()
            return all_ids

    # Percorso classico (senza pages)
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_text(content)
    if not chunks:
        return []

    vector_store = get_vector_store()
    all_ids: List[str] = []

    # batch per non saturare il provider embeddings (rate limit IONOS / Ollama)
    for start in range(0, len(chunks), batch_size):
        batch_chunks = chunks[start:start + batch_size]
        batch_meta = [
            {
                "doc_id": doc_id,
                "chunk_index": start + i,
                "filename": metadata.get("filename", ""),
                "extension": metadata.get("extension", ""),
                "page": metadata.get("page", 1),
            }
            for i in range(len(batch_chunks))
        ]
        batch_ids = [f"{doc_id}_chunk_{start + i}" for i in range(len(batch_chunks))]
        ids = vector_store.add_texts(
            texts=batch_chunks,
            metadatas=batch_meta,
            ids=batch_ids,
        )
        all_ids.extend(ids)

    _invalidate_collection_cache()
    return all_ids


def _invalidate_collection_cache() -> None:
    global _collection_cache, _collection_cache_ts
    with _collection_lock:
        _collection_cache = None
        _collection_cache_ts = 0.0
    # invalida anche search cache (contiene chunk vecchi)
    with _search_cache_lock:
        _search_cache.clear()

def _search_cache_get(key: str):
    with _search_cache_lock:
        hit = _search_cache.get(key)
        if hit and (time.monotonic() - hit[0]) < _search_cache_ttl:
            return hit[1]
    return None

def _search_cache_set(key: str, value):
    with _search_cache_lock:
        if len(_search_cache) > _search_cache_max:
            oldest = min(_search_cache, key=lambda k: _search_cache[k][0])
            _search_cache.pop(oldest, None)
        _search_cache[key] = (time.monotonic(), value)


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
    # precomputa lowercase + token-set una volta sola (loop query diventa O(1) per parola)
    docs = data.get('documents') or []
    metas = data.get('metadatas') or []
    docs_lower = [d.lower() if d else "" for d in docs]
    import re as _re
    _tok_re = _re.compile(r"[a-zà-öø-ÿ0-9]{2,}", _re.I)
    snapshot = {
        "documents": docs,
        "metadatas": metas,
        "documents_lower": docs_lower,
        "token_sets": [set(_tok_re.findall(dl)) for dl in docs_lower],
        "filenames_lower": [(m.get("filename") or "").lower() for m in metas],
    }
    with _collection_lock:
        _collection_cache = snapshot
        _collection_cache_ts = time.monotonic()
    return snapshot


def search_documents(query: str, n_results: int = 5, score_threshold: float = None) -> List[Dict]:
    """Cerca documenti rilevanti — hybrid semantic + keyword con RRF fusion e dedup + cache.

    Miglioramenti performance:
    - result cache 120s per (query,n) — evita re-embedding per query ripetute (Insights, chat similar)
    - keyword scan limitato a snapshot cached + early pruning (max 500 hit)
    - semantic k = n*2 ma clamped a 20 per evitare embedding costoso
    - fusion via Reciprocal Rank Fusion invece di naive concat
    """
    import math
    import re as _re2
    # cache key normalizzata: lower + collapse spazi/punteggiatura -> più hit, meno re-embedding
    norm_q = _re2.sub(r"\s+", " ", _re2.sub(r"[^\w\sà-öø-ÿ]", " ", query.lower())).strip()
    cache_key = f"{norm_q}::{n_results}::{score_threshold}"
    cached = _search_cache_get(cache_key)
    if cached is not None:
        return cached

    vector_store = get_vector_store()

    # 1. Ricerca semantica (k limitato per performance embedding)
    k_sem = min(n_results * 2, 20)
    try:
        semantic_results = vector_store.similarity_search_with_score(query, k=k_sem)
    except Exception as e:
        print(f"[WARN] semantic search failed: {e}")
        semantic_results = []

    # 2. Keyword search (TF-IDF su token-set + boost frase esatta/filename)
    snapshot = _get_collection_snapshot()
    # compat: snapshot vecchi senza token_sets (hot-reload) -> ricostruisci al volo
    if not snapshot.get("token_sets") or len(snapshot.get("token_sets", [])) != len(snapshot["documents"]):
        import re as _re3
        _tok = _re3.compile(r"[a-zà-öø-ÿ0-9]{2,}", _re3.I)
        snapshot["token_sets"] = [set(_tok.findall(dl)) for dl in snapshot["documents_lower"]]
    if not snapshot.get("filenames_lower") or len(snapshot.get("filenames_lower", [])) != len(snapshot["documents"]):
        snapshot["filenames_lower"] = [(m.get("filename") or "").lower() for m in snapshot["metadatas"]]
    query_words = [w for w in norm_q.split() if len(w) >= 2]
    # stopwords IT/EN/DE per ridurre falsi positivi
    stopwords = {"della", "delle", "degli", "nella", "nello", "dalla", "dallo", "come", "sono", "questa", "questo", "quella", "quello", "per", "con", "una", "uno", "del", "dei", "che", "non", "piu", "anche", "solo", "dove", "quando", "cosa", "quale", "quali", "the", "and", "for", "with", "from", "that", "this", "have", "has", "are", "was", "were", "what", "when", "where", "which", "und", "der", "die", "das", "eine", "einer", "mit", "von", "ist", "sind", "nicht", "auch", "nur", "eine"}
    query_words = [w for w in query_words if w not in stopwords]
    if not query_words:
        query_words = [w for w in norm_q.split() if len(w) >= 2]

    keyword_results = []
    # IDF approx: parole rare = peso maggiore (su token-set O(1), non substring)
    doc_count = max(len(snapshot["documents"]), 1)
    word_doc_freq = {}
    tok_sets_all = snapshot.get("token_sets", [])
    # calcola doc freq solo per query words (non per tutto il vocabolario)
    for w in query_words:
        if len(w) >= 5:
            cnt = sum(1 for dl in snapshot["documents_lower"] if w in dl)
        else:
            cnt = sum(1 for ts in tok_sets_all if w in ts)
        word_doc_freq[w] = cnt

    for doc, doc_lower, meta, tok_set, fn_lower in zip(snapshot["documents"], snapshot["documents_lower"], snapshot["metadatas"], snapshot.get("token_sets", []), snapshot.get("filenames_lower", [])):
        if not doc_lower:
            continue
        score = 0.0
        for w in query_words:
            if w in tok_set:
                # TF-IDF semplificato: log(N/df) * count (count via substring, membership via set)
                tf = doc_lower.count(w)
                df = max(word_doc_freq.get(w, 1), 1)
                idf = math.log(doc_count / df + 1)
                score += math.log(1 + tf) * idf
            elif len(w) >= 5 and w in doc_lower:
                # substring fallback solo per parole lunghe (composti, codici)
                tf = doc_lower.count(w)
                df = max(word_doc_freq.get(w, 1), 1)
                idf = math.log(doc_count / df + 1)
                score += math.log(1 + tf) * idf * 0.5
        if score > 0:
            # boost 1: frase esatta della query nel chunk -> x2 (risposte precise)
            if len(norm_q) >= 8 and norm_q in doc_lower:
                score *= 2.0
            # boost 2: parola query nel filename -> x1.5 (es. "benzina" in scontrino-benzina.pdf)
            for w in query_words:
                if len(w) >= 4 and w in (fn_lower or ""):
                    score *= 1.5
                    break
            keyword_results.append({"content": doc, "score": score, "metadata": meta})

    # ordina e pruna keyword a top 500 per non esplodere
    keyword_results.sort(key=lambda x: x["score"], reverse=True)
    keyword_results = keyword_results[:500]

    # 3. Reciprocal Rank Fusion
    # Assegna rank, poi RRF = sum 1/(k+rank) per ogni lista
    RRF_K = 60
    rrf_scores: dict = {}  # key -> {score, item}
    # helper per chiave univoca
    def _key(meta, content):
        return f"{meta.get('doc_id','')}_{meta.get('chunk_index','')}" if meta.get('doc_id') else content[:80]

    for rank, (doc, sc) in enumerate(semantic_results, 1):
        key = _key(doc.metadata, doc.page_content)
        # normalizza score semantico: distanza Chroma -> similarità (1/(1+dist))
        # ma per RRF usiamo solo rank, quindi score originale non serve
        entry = rrf_scores.get(key)
        if not entry:
            rrf_scores[key] = {"rrf": 1.0 / (RRF_K + rank), "content": doc.page_content, "metadata": doc.metadata, "sem_score": float(sc)}
        else:
            entry["rrf"] += 1.0 / (RRF_K + rank)

    for rank, r in enumerate(keyword_results, 1):
        key = _key(r["metadata"], r["content"])
        entry = rrf_scores.get(key)
        if not entry:
            rrf_scores[key] = {"rrf": 1.0 / (RRF_K + rank), "content": r["content"], "metadata": r["metadata"], "kw_score": r["score"]}
        else:
            entry["rrf"] += 1.0 / (RRF_K + rank)
            entry["kw_score"] = r["score"]

    # post-RRF boost: la RRF da sola pareggia (1/61 vs 1/61) quando semantico e keyword
    # indicano doc diversi. Applichiamo boost moltiplicativo sulla RRF finale:
    # - frase esatta nel chunk -> x1.8
    # - parola query nel filename -> x1.4
    # - tie-break: a parità RRF vince chi ha kw_score (match lessicale preciso)
    for entry in rrf_scores.values():
        content_lower = (entry.get("content") or "").lower()
        fn = ((entry.get("metadata") or {}).get("filename") or "").lower()
        if len(norm_q) >= 8 and norm_q in content_lower:
            entry["rrf"] *= 1.8
        for w in query_words:
            if len(w) >= 4 and w in fn:
                entry["rrf"] *= 1.4
                break

    # ordina per RRF decrescente, tie-break su kw_score (precisione lessicale)
    combined = sorted(rrf_scores.values(), key=lambda x: (x["rrf"], x.get("kw_score", 0)), reverse=True)

    # threshold opzionale (filtra risultati troppo deboli)
    if score_threshold is not None:
        combined = [c for c in combined if c["rrf"] >= score_threshold]

    # MMR-lite: max 2 chunk per stesso doc -> più diversità, meno ridondanza
    # (i top-8 tutti dallo stesso PDF sono il caso peggiore per accuratezza)
    seen_per_doc: dict = {}
    diversified = []
    overflow = []
    for c in combined:
        doc_id = (c.get("metadata") or {}).get("doc_id") or (c.get("metadata") or {}).get("filename", "")
        cnt = seen_per_doc.get(doc_id, 0)
        if cnt < 2:
            diversified.append(c)
            seen_per_doc[doc_id] = cnt + 1
        else:
            overflow.append(c)
        if len(diversified) >= n_results * 2:
            break
    # se la diversificazione ha scartato troppo, riempi con overflow
    if len(diversified) < n_results:
        diversified.extend(overflow[: n_results - len(diversified)])
    combined = diversified

    # normalizza output come prima: lista di dict con content/score/metadata
    result = []
    for c in combined[:n_results]:
        result.append({"content": c["content"], "score": round(c["rrf"], 4), "metadata": c["metadata"]})
    _search_cache_set(cache_key, result)
    return result


def search_documents_filtered(query: str, n_results: int = 5, extension: str = None, filename_contains: str = None) -> List[Dict]:
    """Wrapper che filtra per estensione/nome dopo la search (per SearchWithFilters)."""
    results = search_documents(query, n_results=n_results * 3)
    if extension and extension != "all":
        results = [r for r in results if extension.lower() in (r.get("metadata", {}).get("extension") or "").lower()]
    if filename_contains:
        fc = filename_contains.lower()
        results = [r for r in results if fc in (r.get("metadata", {}).get("filename") or "").lower()]
    return results[:n_results]


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


_embeddings_check_cache: Dict[str, float] = {"ts": 0.0, "ok": False}
_EMBEDDINGS_CHECK_TTL = 60.0


def check_embeddings_connection() -> bool:
    """Verifica il provider embedding configurato (cached 60s).

    IONOS: mini-embedding di prova su /v1/embeddings.
    Ollama: GET /api/tags come prima.
    """
    now = time.monotonic()
    if (now - _embeddings_check_cache["ts"]) < _EMBEDDINGS_CHECK_TTL:
        return bool(_embeddings_check_cache["ok"])
    ok = False
    try:
        if EMBED_PROVIDER == "ionos":
            IonosEmbeddings().embed_query("health check")
            ok = True
        else:
            import requests as _rq

            r = _rq.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
            ok = r.status_code == 200
    except Exception as e:
        print(f"[WARN] embeddings ({EMBED_PROVIDER}) non disponibili: {e}")
    _embeddings_check_cache.update(ts=now, ok=ok)
    return ok