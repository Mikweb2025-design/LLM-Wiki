"""Interazione con AI - IONOS con fallback a Ollama"""
import requests
import ollama
from typing import List, Dict
from app.config import IONOS_MODEL, IONOS_BASE_URL, IONOS_API_KEY, OLLAMA_BASE_URL
from app.utils.cache import ttl_cache

USE_IONOS = bool(IONOS_API_KEY)

# Sessione HTTP riusabile (keep-alive) -> meno latenza, meno handshake TLS
_session = requests.Session()


def _build_context_text(context: List[Dict], max_total_chars: int = 12000, per_doc_chars: int = 1800) -> str:
    """Costruisce context troncato con Citations 2.0: include p. N quando disponibile."""
    if not context:
        return "Nessun documento trovato nel contesto."
    parts = []
    total = 0
    for i, doc in enumerate(context, 1):
        meta = doc.get('metadata', {}) or {}
        filename = meta.get('filename', 'sconosciuto')
        page = meta.get('page')
        page_str = f" p.{page}" if page else ""
        content = (doc.get('content') or '').strip()
        if not content:
            continue
        chunk = content[:per_doc_chars]
        entry = f"[Documento {i}] {filename}{page_str} (score:{doc.get('score','?')}):\n{chunk}"
        if total + len(entry) > max_total_chars:
            remaining = max_total_chars - total
            if remaining > 300:
                entry = entry[:remaining] + " [...troncato]"
                parts.append(entry)
            break
        parts.append(entry)
        total += len(entry)
    return "\n\n".join(parts) if parts else "Nessun documento trovato nel contesto."


def _system_prompt_for_lang(lang: str, with_citations: bool = True) -> str:
    l = (lang or "it").lower()[:2]
    citation = ""
    if with_citations:
        citation = {
            "it": "Cita sempre il nome del documento con pagina quando presente, formato `filename p.N` tra parentesi (es. `contratto.pdf p.3`). Se il contesto indica p. N usalo; altrimenti cita solo il filename.",
            "en": "Always cite the document name with page when present, format `filename p.N` in parentheses (e.g. `contract.pdf p.3`). If context shows p. N use it; otherwise cite only filename.",
            "de": "Zitiere immer den Dokumentnamen mit Seite wenn vorhanden, Format `filename S.N` in Klammern (z. B. `vertrag.pdf S.3`). Wenn Kontext S. N zeigt, nutze es; sonst nur Dateiname.",
        }.get(l, "")
    if l == "en":
        return (
            "You are an assistant for a Wiki knowledge base. "
            "Answer in English, based ONLY on the documents in Context. "
            "If info is not in documents, say so explicitly and suggest what to search. "
            + (citation + " " if citation else "") +
            "Concise but complete answer, use markdown when helpful."
        )
    if l == "de":
        return (
            "Du bist ein Assistent für eine Wiki-Wissensdatenbank. "
            "Antworte auf Deutsch, basierend NUR auf den Dokumenten im Kontext. "
            "Wenn Info nicht in Dokumenten ist, sage es explizit und schlage vor, wonach zu suchen ist. "
            + (citation + " " if citation else "") +
            "Prägnante aber vollständige Antwort, nutze Markdown wenn hilfreich."
        )
    return (
        "Sei un assistente per una knowledge base Wiki. "
        "Rispondi in italiano, basandoti SOLO sui documenti forniti nel Contesto. "
        "Se l'informazione non è nei documenti, dillo esplicitamente e suggerisci cosa cercare. "
        + (citation + " " if citation else "") +
        "Risposta concisa ma completa, usa markdown quando utile."
    )

def chat_with_llm(query: str, context: List[Dict], model: str = None, history: List[Dict] = None, lang: str = "it") -> str:
    """Chatta con LLM usando IONOS (primario) e Ollama (fallback).

    history: lista di {role, content} per memoria conversazionale (ultimi 6 msg).
    lang: 'it' | 'en' | 'de' — lingua risposta.
    """
    context_text = _build_context_text(context)

    system_prompt = _system_prompt_for_lang(lang, with_citations=True)

    messages = [{"role": "system", "content": system_prompt}]

    # aggiungi history (max 6 turni per non esplodere context)
    if history:
        for h in history[-6:]:
            role = h.get("role")
            content = (h.get("content") or "").strip()
            if role in ("user", "assistant") and content:
                # evita di duplicare la query corrente
                if role == "user" and content == query:
                    continue
                messages.append({"role": role, "content": content[:800]})

    messages.append({"role": "user", "content": f"Contesto:\n{context_text}\n\nDomanda: {query}"})

    # Prima IONOS (cloud)
    if USE_IONOS:
        try:
            response = _session.post(
                f"{IONOS_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {IONOS_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": IONOS_MODEL,
                    "messages": messages,
                    "temperature": 0.3,
                    "max_tokens": 2048,
                },
                timeout=120,
            )
            if response.status_code == 200:
                return response.json()["choices"][0]["message"]["content"]
            print(f"[WARN] IONOS error {response.status_code}: {response.text[:200]}")
        except Exception as e:
            print(f"[WARN] IONOS exception: {e}")

    # Fallback Ollama (locale)
    try:
        use_model = model or "llama3"
        response = ollama.chat(
            model=use_model,
            messages=messages,
            options={"temperature": 0.3, "num_ctx": 8192}
        )
        return response["message"]["content"]
    except Exception as e:
        return f"Errore: IONOS e Ollama non disponibili. {str(e)}"


def chat_with_llm_stream(query: str, context: List[Dict], model: str = None, history: List[Dict] = None, lang: str = "it"):
    """Generator streaming per SSE: yield chunk di testo.

    Usa IONOS con stream=True se disponibile, altrimenti fallback non-streaming a blocchi.
    lang: 'it' | 'en' | 'de'
    """
    context_text = _build_context_text(context)
    system_prompt = _system_prompt_for_lang(lang, with_citations=True)
    messages = [{"role": "system", "content": system_prompt}]
    if history:
        for h in history[-6:]:
            if h.get("role") in ("user", "assistant") and h.get("content"):
                messages.append({"role": h["role"], "content": h["content"][:800]})
    messages.append({"role": "user", "content": f"Contesto:\n{context_text}\n\nDomanda: {query}"})

    # Prova IONOS streaming
    if USE_IONOS:
        try:
            resp = _session.post(
                f"{IONOS_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {IONOS_API_KEY}", "Content-Type": "application/json"},
                json={"model": IONOS_MODEL, "messages": messages, "temperature": 0.3, "max_tokens": 2048, "stream": True},
                timeout=120, stream=True,
            )
            if resp.status_code == 200:
                import json as _json
                for line in resp.iter_lines(decode_unicode=True):
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        obj = _json.loads(data)
                        delta = obj["choices"][0].get("delta", {}).get("content")
                        if delta:
                            yield delta
                    except Exception:
                        continue
                return
        except Exception as e:
            print(f"[WARN] IONOS stream fallito: {e}")

    # Fallback: chiamata non-streaming spezzata a chunk
    text = chat_with_llm(query, context, model=model, history=history, lang=lang)
    # yield a parole per simulare streaming
    for word in text.split(" "):
        yield word + " "


@ttl_cache(seconds=60.0)
def list_available_models() -> List[str]:
    """Lista modelli disponibili (cached 60s)."""
    models = []
    if USE_IONOS:
        try:
            response = _session.get(
                f"{IONOS_BASE_URL}/models",
                headers={"Authorization": f"Bearer {IONOS_API_KEY}"},
                timeout=10
            )
            if response.status_code == 200:
                data = response.json()["data"]
                models.extend([m["id"] for m in data[:10]])
        except Exception as e:
            print(f"[WARN] Errore lettura modelli IONOS: {e}")
    if not models:
        try:
            result = ollama.list()
            models.extend([m["model"] for m in result["models"]])
        except Exception as e:
            print(f"[WARN] Errore lettura modelli Ollama: {e}")
    return models or ["Nessuno disponibile"]


@ttl_cache(seconds=30.0)
def check_ionos_connection() -> bool:
    """Verifica connessione IONOS (cached 30s)."""
    if not USE_IONOS:
        return False
    try:
        response = _session.get(
            f"{IONOS_BASE_URL}/models",
            headers={"Authorization": f"Bearer {IONOS_API_KEY}"},
            timeout=10
        )
        if response.status_code == 200:
            return True
    except Exception as e:
        print(f"[WARN] IONOS non disponibile: {e}")
    return False


@ttl_cache(seconds=15.0)
def check_ollama_connection() -> bool:
    """Verifica connessione Ollama locale (cached 15s)."""
    try:
        response = _session.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=3)
        return response.status_code == 200
    except Exception:
        return False


def invalidate_provider_caches() -> None:
    """Forza re-check su tutti i provider (utile per /health/full o reload manuale)."""
    check_ionos_connection.cache_clear()  # type: ignore[attr-defined]
    check_ollama_connection.cache_clear()  # type: ignore[attr-defined]
    list_available_models.cache_clear()  # type: ignore[attr-defined]
