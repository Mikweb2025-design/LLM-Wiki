# LLM-Wiki backend — FastAPI + ChromaDB + OCR (tesseract/poppler)
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        tesseract-ocr-eng \
        tesseract-ocr-ita \
        tesseract-ocr-deu \
        poppler-utils \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY backend/ ./

# IONOS embeddings di default: nessun modello da scaricare, nessun Ollama richiesto.
# Se EMBED_PROVIDER=ollama, punta OLLAMA_BASE_URL all'Ollama dell'host Docker
# (es. http://host.docker.internal:11434 oppure http://172.17.0.1:11434).

EXPOSE 8010

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8010}"]
