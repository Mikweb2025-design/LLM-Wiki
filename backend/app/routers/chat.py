"""API Router per Chat — include streaming SSE."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.models.schemas import ChatRequest, ChatResponse
from app.utils.vector_store import search_documents
from app.utils.llm_handler import chat_with_llm, chat_with_llm_stream, list_available_models, check_ionos_connection, check_ollama_connection
from app.utils.database import save_chat_message, get_chat_history
from app.config import IONOS_MODEL

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Invia messaggio chat e ricevi risposta dalla LLM (con history)."""
    # n_results 8 è buon compromesso qualità/latency; 20 era eccessivo (embedding + prompt enorme)
    context = search_documents(request.message, n_results=8)
    
    if not context:
        return ChatResponse(
            answer="Non ho trovato documenti indicizzati. Carica prima dei documenti nella Wiki.",
            sources=[],
            model=IONOS_MODEL,
        )
    
    model = request.model or IONOS_MODEL
    # estrai history se presente nella request (campo opzionale)
    history = getattr(request, 'history', None) or []
    result = chat_with_llm(request.message, context, model, history=history)

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


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """Chat streaming via SSE — il frontend riceve token incrementali."""
    import json
    context = search_documents(request.message, n_results=8)
    if not context:
        async def _empty():
            yield f"data: {json.dumps({'token': 'Non ho trovato documenti indicizzati. Carica prima dei documenti.', 'done': True})}\n\n"
        return StreamingResponse(_empty(), media_type="text/event-stream")

    history = getattr(request, 'history', None) or []
    model = request.model or IONOS_MODEL

    def _gen():
        full = []
        for token in chat_with_llm_stream(request.message, context, model, history=history):
            full.append(token)
            yield f"data: {json.dumps({'token': token})}\n\n"
        # salva a fine stream
        answer = "".join(full)
        from app.utils.llm_handler import USE_IONOS
        provider = "ollama" if not USE_IONOS else ("ionos" if check_ionos_connection() else "ollama")
        try:
            save_chat_message(request.message, answer, f"{model} ({provider})")
        except Exception:
            pass
        # invia sources finali
        sources = [{"filename": d["metadata"].get("filename",""), "score": round(d["score"],3), "snippet": d["content"][:200]+"..."} for d in context]
        yield f"data: {json.dumps({'done': True, 'sources': sources, 'model': f'{model} ({provider})'})}\n\n"

    return StreamingResponse(_gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/history")
async def chat_history():
    """Ottiene cronologia chat"""
    return get_chat_history()


@router.get("/models")
async def available_models():
    """Lista modelli disponibili"""
    models = list_available_models()
    return {"models": models, "current": IONOS_MODEL, "ollama_connected": check_ollama_connection()}
