"""Applicazione FastAPI principale"""
import os
import time
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.utils.database import init_db
from app.routers import chat, documents, voice, status, analytics


# ---------------------------------------------------------------------------
# Lifespan: pre-warm pesante (ChromaDB + Ollama embeddings) in background
# così il primo POST /api/chat non paga 3-5 secondi di cold start.
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    app.state.start_time = time.monotonic()
    app.state.request_count = 0

    async def _bg_prewarm():
        try:
            from app.utils.vector_store import prewarm
            # esegui prewarm in thread separato per non bloccare il loop
            await asyncio.to_thread(prewarm)
            print("[INFO] vector_store prewarm completato")
        except Exception as e:
            print(f"[WARN] prewarm fallito: {e}")

    # parte in background, l'app è già pronta a rispondere a /health
    prewarm_task = asyncio.create_task(_bg_prewarm())
    try:
        yield
    finally:
        prewarm_task.cancel()


app = FastAPI(
    title="LLM Wiki",
    description="Wiki intelligente con chat testuale e vocale",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS per frontend
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3456,http://localhost:8000,"
    "http://127.0.0.1:3000,http://127.0.0.1:3456,http://127.0.0.1:8000,"
    "app://.",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Compressione: riduce molto le risposte JSON grandi (es. lista documenti, search)
app.add_middleware(GZipMiddleware, minimum_size=1024)


# ---------------------------------------------------------------------------
# Middleware: contatore richieste + Server-Timing per debug client-side
# ---------------------------------------------------------------------------
@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    dt_ms = (time.perf_counter() - t0) * 1000.0
    try:
        app.state.request_count += 1
    except AttributeError:
        app.state.request_count = 1
    response.headers["Server-Timing"] = f"app;dur={dt_ms:.1f}"
    return response


# Registra router
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(voice.router)
app.include_router(status.router)
app.include_router(analytics.router)


@app.get("/")
async def root():
    return {"name": "LLM Wiki", "version": "1.0.0", "status": "running"}


@app.get("/health")
async def health_check():
    """Health-check ultra-leggero (usato dal frontend ogni 15s)."""
    return {"status": "healthy"}


@app.get("/health/full")
async def health_full():
    """Diagnostica completa: ollama, ionos, chroma, db, uptime."""
    from app.utils.llm_handler import (
        USE_IONOS,
        check_ionos_connection,
        check_ollama_connection,
    )
    from app.utils.vector_store import get_store_stats
    from app.utils.database import get_document_count

    chroma_ok = True
    chunks = 0
    try:
        chunks = get_store_stats().get("total_chunks", 0)
    except Exception as e:
        chroma_ok = False
        chunks = 0

    db_ok = True
    docs = 0
    try:
        docs = get_document_count()
    except Exception:
        db_ok = False

    ionos_ok = check_ionos_connection() if USE_IONOS else None
    ollama_ok = check_ollama_connection()

    overall = ollama_ok and chroma_ok and db_ok
    return {
        "status": "healthy" if overall else "degraded",
        "uptime_seconds": round(time.monotonic() - app.state.start_time, 2),
        "components": {
            "ollama": {"ok": ollama_ok},
            "ionos": {"ok": ionos_ok, "configured": USE_IONOS},
            "chroma": {"ok": chroma_ok, "total_chunks": chunks},
            "database": {"ok": db_ok, "total_documents": docs},
        },
    }


@app.get("/metrics")
async def metrics():
    """Metriche base per dashboard / monitoring."""
    return {
        "uptime_seconds": round(time.monotonic() - app.state.start_time, 2),
        "request_count": app.state.request_count,
    }
