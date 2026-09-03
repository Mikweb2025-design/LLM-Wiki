"""API Router per Chat — include streaming SSE + grafici intelligenti da chat."""
import re
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.models.schemas import ChatRequest, ChatResponse
from app.utils.vector_store import search_documents
from app.utils.llm_handler import chat_with_llm, chat_with_llm_stream, list_available_models, check_ionos_connection, check_ollama_connection
from app.utils.database import save_chat_message, get_chat_history
from app.config import IONOS_MODEL

router = APIRouter(prefix="/api/chat", tags=["chat"])

# ---------------------------------------------------------------------------
# Grafici intelligenti — rilevamento intent in chat
# ---------------------------------------------------------------------------
# Solo intent esplicito di grafico — parole generiche come "fattura" da sole NON triggerano.
_CHART_KEYWORDS = [
    "grafico", "grafici", "diagramma", "diagrammi",
    "chart", "charts", "graph", "diagram",
    "fammi un grafico", "fai un grafico", "crea un grafico", "genera un grafico",
    "make a chart", "create a chart", "show me a chart",
    "quanto ho speso", "quanti soldi ho speso", "how much did i spend",
    "spese per",  # "spese per categoria" è intent grafico se con "grafico" o "quanto"
]
# per essere considerato chart, deve contenere almeno una di queste + (grafico|speso|guadagn) ?
_CHART_EXPLICIT = ["grafico", "grafici", "diagramma", "chart", "graph", "diagram"]
# per preset auto
_SPESA_HINT = ["benzina", "carburante", "diesel", "fuel", "cibo", "food", "spesa", "spese", "affitto", "rent", "utenze", "bollette"]
_GUADAGNO_HINT = ["guadagn", "stipend", "earnings", "income", "salary", "gehalt"]

def _detect_chart_intent(msg: str) -> bool:
    low = msg.lower()
    # Deve contenere una parola esplicita di grafico, oppure una frase completa "quanto ho speso" + richiesta visiva
    has_explicit = any(k in low for k in _CHART_EXPLICIT)
    if has_explicit:
        return True
    # Frasi tipo "quanto ho speso per benzina? fammi un grafico" → già coperta da has_explicit (grafico)
    # Ma anche "quanto ho speso per benzina?" da sola NON deve fare grafico — solo se chiede grafico
    # Quindi richiediamo sempre grafico/chart/diagramma, tranne i casi "fammi un grafico..." già inclusi
    # Per compatibilità, lasciamo anche "fammi un grafico di tutti i miei guadagni" → ha_explicit true
    # Se proprio vuole solo "quanti soldi ho speso per benzina" senza grafico, non triggerare
    return False

def _infer_preset_and_group(msg: str) -> tuple:
    low = msg.lower()
    # preset
    if any(k in low for k in _GUADAGNO_HINT):
        preset = "stipendi"
        sum_field = "importo_lordo"
    elif any(k in low for k in _SPESA_HINT):
        preset = "spese"
        sum_field = "importo"
    elif "fattura" in low or "invoice" in low:
        preset = "fatture"
        sum_field = "importo"
    else:
        preset = "spese" if "spes" in low else "fatture"
        sum_field = "importo"
        if any(k in low for k in _GUADAGNO_HINT):
            sum_field = "importo_lordo"
    # group_by
    if "categoria" in low or "category" in low or "kategorie" in low:
        group_by = "categoria"
    elif "fornitore" in low or "vendor" in low or "lieferant" in low:
        group_by = "fornitore"
    elif "mese" in low or "month" in low or "monat" in low or "guadagni" in low or "speso" in low:
        group_by = "month"
    else:
        group_by = "month"
    return preset, sum_field, group_by

async def _try_build_chart(query: str, context) -> dict | None:
    """Prova a generare chart_data dai documenti di contesto. Ritorna dict chart o None."""
    try:
        # filenames dai context (chunk metadata) — deduplica
        filenames = []
        seen = set()
        for doc in (context or []):
            fn = doc.get("metadata", {}).get("filename")
            if fn and fn not in seen:
                seen.add(fn)
                filenames.append(fn)

        low = query.lower()
        # Se query chiede guadagni/stipendi o "tutti" → prendi TUTTI i doc rilevanti per preset (non solo i top 8 semantici che spesso sono rumore)
        is_all = any(k in low for k in ["tutti", "tutte", "tutto", "all", "alle"])
        is_guadagni = any(k in low for k in ["guadagn", "stipend", "earnings", "income", "gehalt", "lohn", "mie guadagni", "miei guadagni"])
        if is_all or is_guadagni or len(filenames) < 3:
            try:
                from app.utils.database import get_all_documents
                all_docs = get_all_documents() or []
                preset_hint, _, _ = _infer_preset_and_group(query)
                # filtra per preset quando serve
                if preset_hint == "stipendi":
                    keywords = ["remuneration", "entgelt", "pay", "salary", "stipend", "gehalt", "lohn", "verdien"]
                    filtered = [d for d in all_docs if any(k in d["filename"].lower() for k in keywords)]
                    if len(filtered) >= 2:
                        filenames = [d["filename"] for d in filtered[:20]]
                    else:
                        filenames = [d["filename"] for d in all_docs[:20]]
                elif "benzina" in low or "carburante" in low:
                    # per benzina, cerca doc con benzina nel filename o prendi spese generiche
                    kw = ["benzina", "carburante", "diesel", "fuel", "tank"]
                    filtered = [d for d in all_docs if any(k in d["filename"].lower() for k in kw)]
                    filenames = [d["filename"] for d in (filtered[:12] if filtered else all_docs[:12])]
                else:
                    # default: prendi tutti i doc se "tutti"
                    if is_all:
                        filenames = [d["filename"] for d in all_docs[:20]]
                # deduplica mantenendo ordine
                seen2 = set(); uniq = []
                for f in filenames:
                    if f not in seen2:
                        seen2.add(f); uniq.append(f)
                filenames = uniq
            except: pass
        if not filenames:
            return None
        preset, sum_field, group_by = _infer_preset_and_group(query)
        # chiama aggregate — per chat usiamo LLM ma con cache (prima chiamata ~15s, poi <1s)
        from app.routers.analytics import aggregate_data
        payload = {"filenames": filenames[:12], "preset": preset, "group_by": group_by, "sum_field": sum_field}
        result = await aggregate_data(payload)  # type: ignore
        if not result or not result.get("chart_data"):
            return None
        # filtra chart con solo zeri o solo Senza data vuoto
        chart = result["chart_data"]
        total = result.get("total", 0)
        # se tutto Senza data e zero, non mostrare
        if len(chart) == 1 and chart[0]["label"] == "Senza data" and total == 0:
            return None
        # rimuovi voci Senza data con 0 se ci sono anche altre voci valide
        if len(chart) > 1:
            chart = [c for c in chart if not (c["label"] == "Senza data" and c["value"] == 0)]
            total = sum(c["value"] for c in chart)
        if not chart:
            return None
        return {
            "chart_data": chart,
            "total": round(total, 2),
            "group_by": result["group_by"],
            "preset": preset,
            "sum_field": result.get("sum_field", sum_field),
            "count": result.get("count", 0),
        }
    except Exception as e:
        print(f"[WARN] chart intent build failed: {e}")
        import traceback; traceback.print_exc()
        return None


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Invia messaggio chat e ricevi risposta dalla LLM (con history) + grafico se richiesto."""
    # lingua richiesta (it/en/de) — default it per retrocompat
    lang = (getattr(request, 'lang', None) or "it").lower()[:2]
    if lang not in ("it","en","de"): lang="it"
    # n_results 8 è buon compromesso qualità/latency; 20 era eccessivo (embedding + prompt enorme)
    context = search_documents(request.message, n_results=8)
    
    if not context:
        msg_no_docs = {
            "it": "Non ho trovato documenti indicizzati. Carica prima dei documenti nella Wiki.",
            "en": "No indexed documents found. Please upload documents to the Wiki first.",
            "de": "Keine indizierten Dokumente gefunden. Bitte lade zuerst Dokumente in das Wiki hoch.",
        }.get(lang, "Non ho trovato documenti indicizzati. Carica prima dei documenti nella Wiki.")
        return ChatResponse(
            answer=msg_no_docs,
            sources=[],
            model=IONOS_MODEL,
        )
    
    model = request.model or IONOS_MODEL
    # estrai history se presente nella request (campo opzionale)
    history = getattr(request, 'history', None) or []
    result = chat_with_llm(request.message, context, model, history=history, lang=lang)

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
            "page": doc["metadata"].get("page"),
            "highlight": doc["content"][:180],
        }
        for doc in context
    ]

    # Grafico intelligente se intent rilevato
    chart = None
    if _detect_chart_intent(request.message):
        chart = await _try_build_chart(request.message, context)
        if chart:
            # Se LLM dice "non posso creare grafico" ma noi lo abbiamo creato, sovrascrivi con nota positiva
            if "non posso" in answer.lower() and "grafico" in answer.lower():
                answer += f"\n\n📊 *Grafico generato con successo dai tuoi documenti ({chart['preset']} per {chart['group_by']}, totale {chart['total']}€ su {chart['count']} documenti).*"
            elif "grafico" not in answer.lower() and "chart" not in answer.lower():
                answer += f"\n\n📊 *Grafico generato automaticamente ({chart['preset']} per {chart['group_by']}, totale {chart['total']}€).*"

    return ChatResponse(answer=answer, sources=sources, model=f"{model} ({provider})", chart=chart)


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """Chat streaming via SSE — il frontend riceve token incrementali + chart finale se richiesto."""
    import json
    lang = (getattr(request, 'lang', None) or "it").lower()[:2]
    if lang not in ("it","en","de"): lang="it"
    context = search_documents(request.message, n_results=8)
    if not context:
        msg_no_docs = {
            "it": "Non ho trovato documenti indicizzati. Carica prima dei documenti.",
            "en": "No indexed documents found. Please upload documents first.",
            "de": "Keine indizierten Dokumente gefunden. Bitte lade zuerst Dokumente hoch.",
        }.get(lang, "Non ho trovato documenti indicizzati. Carica prima dei documenti.")
        async def _empty():
            yield f"data: {json.dumps({'token': msg_no_docs, 'done': True})}\n\n"
        return StreamingResponse(_empty(), media_type="text/event-stream")

    history = getattr(request, 'history', None) or []
    model = request.model or IONOS_MODEL

    # pre-calcola chart se intent (non blocca lo streaming, fatto prima dello yield)
    chart = None
    if _detect_chart_intent(request.message):
        chart = await _try_build_chart(request.message, context)

    def _gen():
        full = []
        for token in chat_with_llm_stream(request.message, context, model, history=history, lang=lang):
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
        # invia sources + chart finali
        sources = [{"filename": d["metadata"].get("filename",""), "score": round(d["score"],3), "snippet": d["content"][:200]+"..."} for d in context]
        payload = {'done': True, 'sources': sources, 'model': f'{model} ({provider})'}
        if chart:
            payload['chart'] = chart
        yield f"data: {json.dumps(payload)}\n\n"

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
