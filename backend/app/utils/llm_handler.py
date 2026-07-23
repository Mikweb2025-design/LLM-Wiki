"""Interazione con AI - IONOS con fallback a Ollama"""
import requests
import ollama
from typing import List, Dict
from app.config import IONOS_MODEL, IONOS_BASE_URL, IONOS_API_KEY, OLLAMA_BASE_URL
from app.utils.cache import ttl_cache

USE_IONOS = bool(IONOS_API_KEY)

# Sessione HTTP riusabile (keep-alive) -> meno latenza, meno handshake TLS
_session = requests.Session()


def chat_with_llm(query: str, context: List[Dict], model: str = None) -> str:
    """Chatta con LLM usando IONOS (primario) e Ollama (fallback)"""
    context_text = ""
    for i, doc in enumerate(context, 1):
        filename = doc.get('metadata', {}).get('filename', 'sconosciuto')
        content = doc.get('content', '')[:500]
        context_text += f"[Documento {i}] {filename}:\n{content}\n\n"

    if not context_text.strip():
        context_text = "Nessun documento trovato nel contesto."

    messages = [
        {"role": "system", "content": "Rispondi in italiano basandoti SOLO sui documenti forniti. Se non trovi info, dillo."},
        {"role": "user", "content": f"Contesto:\n{context_text}\n\nDomanda: {query}"}
    ]

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
        response = ollama.chat(
            model="llama3",
            messages=messages,
            options={"temperature": 0.3}
        )
        return response["message"]["content"]
    except Exception as e:
        return f"Errore: IONOS e Ollama non disponibili. {str(e)}"


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
