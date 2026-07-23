#!/bin/bash
# Script installazione LLM Wiki

echo "🚀 Installazione LLM Wiki..."

# Controlla Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 non trovato. Installa Python 3.9+"
    exit 1
fi

# Controlla pip
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 non trovato"
    exit 1
fi

# Backend
echo ""
echo "📦 Installazione dipendenze backend..."
cd "$(dirname "$0")/backend"
pip3 install -r requirements.txt

# Frontend
echo ""
echo "📦 Installazione dipendenze frontend..."
cd ../frontend
npm install

# Desktop (opzionale)
echo ""
echo "📦 Installazione dipendenze desktop (opzionale)..."
cd ../electron
npm install

echo ""
echo "✅ Installazione completata!"
echo ""
echo "📋 Prossimi passi:"
echo "1. Installa Ollama: https://ollama.ai"
echo "2. Scarica modelli: ollama pull llama3 && ollama pull nomic-embed-text"
echo "3. Installa Tesseract: brew install tesseract"
echo "4. Avvia l'app: ./start.sh"
