#!/bin/bash
# Script avvio LLM Wiki

echo "🚀 Avvio LLM Wiki..."

# Controlla Ollama
if ! command -v ollama &> /dev/null; then
    echo "⚠️  Ollama non trovato. Installa da https://ollama.ai"
    echo "    La chat non funzionerà senza Ollama."
    read -p "Continuare comunque? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Avvia backend in background
echo "📡 Avvio backend..."
cd "$(dirname "$0")/backend"
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Attendi backend pronto
echo "⏳ Attesa backend..."
sleep 3

# Avvia frontend
echo "🌐 Avvio frontend..."
cd ../frontend
npm start &
FRONTEND_PID=$!

echo ""
echo "✅ LLM Wiki avviato!"
echo "   Frontend: http://localhost:3000"
echo "   Backend API: http://localhost:8000"
echo "   Documenti: $(pwd)/../backend/data/documents"
echo ""
echo "Premi Ctrl+C per fermare"

# Cleanup
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
