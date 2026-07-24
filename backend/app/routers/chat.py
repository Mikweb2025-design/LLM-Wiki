"""API Router per Chat"""
from fastapi import APIRouter, HTTPException
from app.models.schemas import ChatRequest, ChatResponse
from app.utils.vector_store import search_documents
from app.utils.llm_handler import chat_with_llm, list_available_models, check_ionos_connection, check_ollama_connection
from app.utils.database import save_chat_message, get_chat_history
from app.config import IONOS_MODEL

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Invia messaggio chat e ricevi risposta dalla LLM"""
    context = search_documents(request.message, n_results=20)
    
    if not context:
        return ChatResponse(
            answer="Non ho trovato documenti indicizzati. Carica prima dei documenti nella Wiki.",
            sources=[],
            model=IONOS_MODEL,
        )
    
    model = request.model or IONOS_MODEL
    result = chat_with_llm(request.message, context, model)
    
    if isinstance(result, dict):
        answer = result.get("answer", str(result))
        provider = result.get("provider", "unknown")
    else:
        answer = str(result)
        from app.utils.llm_handler import USE_IONOS
        provider = "ollama" if not USE_IONOS else ("ionos" if check_ionos_connection() else "ollama")
    
    save_chat_message(request.message, answer, f"{model} ({provider})")
    
    sources = [
        {
            "filename": doc["metadata"].get("filename", ""),
            "score": round(doc["score"], 3),
            "snippet": doc["content"][:200] + "...",
        }
        for doc in context
    ]
    
    return ChatResponse(answer=answer, sources=sources, model=f"{model} ({provider})")


@router.get("/history")
async def chat_history():
    """Ottiene cronologia chat"""
    return get_chat_history()


@router.get("/models")
async def available_models():
    """Lista modelli disponibili"""
    models = list_available_models()
    return {"models": models, "current": IONOS_MODEL, "ollama_connected": check_ollama_connection()}
