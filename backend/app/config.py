"""Configurazione applicazione LLM Wiki"""
import os
from pathlib import Path

# Percorsi
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DOCUMENTS_DIR = DATA_DIR / "documents"
CHROMA_DIR = BASE_DIR / "chroma_db"
DB_PATH = DATA_DIR / "wiki.db"

# Assicurati che le directory esistano
DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Ollama (per embeddings e trascrizione)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# IONOS AI (per chat LLM)
IONOS_API_KEY = os.getenv("IONOS_API_KEY")
if not IONOS_API_KEY:
    env_file = BASE_DIR / ".env"
    if env_file.exists():
        with open(env_file, "r") as f:
            for line in f:
                if line.startswith("IONOS_API_KEY="):
                    IONOS_API_KEY = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                    break
if not IONOS_API_KEY:
    import warnings
    warnings.warn("IONOS_API_KEY non impostata. Uso Ollama.")
    IONOS_MODEL = os.getenv("IONOS_MODEL", "llama3:latest")
else:
    IONOS_MODEL = os.getenv("IONOS_MODEL", "meta-llama/Llama-3.3-70B-Instruct")
IONOS_BASE_URL = os.getenv("IONOS_BASE_URL", "https://openai.inference.de-txl.ionos.com/v1")

# IONOS Embeddings (sostituisce Ollama nomic-embed-text; verificato su /v1/models).
# Batch supportato: il client manda liste di stringhe in un'unica POST /embeddings.
IONOS_EMBED_MODEL = os.getenv("IONOS_EMBED_MODEL", "BAAI/bge-m3")

# Provider embedding: "ionos" (default quando IONOS_API_KEY è impostata) oppure
# "ollama" (legacy nomic-embed-text). La dipendenza hard da Ollama per gli
# embedding è rimossa: il fallback LLM locale via Ollama resta invariato.
_EMBED_DEFAULT = "ionos" if IONOS_API_KEY else "ollama"
EMBED_PROVIDER = os.getenv("EMBED_PROVIDER", _EMBED_DEFAULT).lower()
if EMBED_PROVIDER not in ("ionos", "ollama"):
    import warnings as _w
    _w.warn(f"EMBED_PROVIDER non valido ({EMBED_PROVIDER!r}), uso {_EMBED_DEFAULT!r}.")
    EMBED_PROVIDER = _EMBED_DEFAULT

# IONOS Vision per OCR Hybrid (se non impostato usa stesso base ma modello vision)
IONOS_VISION_MODEL = os.getenv("IONOS_VISION_MODEL", "meta-llama/Llama-3.2-11B-Vision-Instruct")
# soglia OCR: se Tesseract produce <50 chars per pagina, prova IONOS Vision
OCR_HYBRID_ENABLED = os.getenv("OCR_HYBRID_ENABLED", "1") not in ("0","false","False")
OCR_MIN_CHARS_PER_PAGE = int(os.getenv("OCR_MIN_CHARS_PER_PAGE", "50"))

# App
APP_NAME = "LLM Wiki"
APP_VERSION = "1.0.0"
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))