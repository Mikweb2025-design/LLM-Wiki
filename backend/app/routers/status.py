"""API Router per Stato Sistema"""
from fastapi import APIRouter
from app.models.schemas import SystemStatus
from app.utils.llm_handler import (
    USE_IONOS,
    check_ionos_connection,
    check_ollama_connection,
    list_available_models,
    invalidate_provider_caches,
)
from app.utils.vector_store import get_store_stats
from app.utils.database import get_document_count
from app.config import IONOS_MODEL

router = APIRouter(prefix="/api/status", tags=["status"])


@router.get("/", response_model=SystemStatus)
async def system_status():
    """Stato del sistema (cached per provider — refresh ogni 15-30s)."""
    ionos_ok = check_ionos_connection() if USE_IONOS else False
    ollama_ok = check_ollama_connection()
    primary = "ionos" if (USE_IONOS and ionos_ok) else "ollama"
    return SystemStatus(
        ollama_connected=ollama_ok,  # BUG FIX: prima ritornava check_ionos_connection()
        ionos_connected=ionos_ok,
        primary_provider=primary,
        available_models=list_available_models(),
        current_model=IONOS_MODEL,
        total_documents=get_document_count(),
        total_chunks=get_store_stats().get("total_chunks", 0),
    )


@router.post("/refresh")
async def refresh_status():
    """Forza re-check di IONOS/Ollama, bypassando la cache TTL."""
    invalidate_provider_caches()
    return {"ok": True, "message": "Provider caches cleared"}
