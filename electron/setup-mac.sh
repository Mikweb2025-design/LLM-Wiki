#!/bin/bash
# Setup script for LLM Wiki on Mac

echo "🚀 Configurazione LLM Wiki..."

# Controlla se Python3 è installato
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 non trovato. Installa Python3 prima di continuare."
    exit 1
fi

# Controlla se Ollama è installato
if ! command -v ollama &> /dev/null; then
    echo "⚠️  Ollama non trovato. Installa da https://ollama.ai"
    echo "   La chat non funzionerà senza Ollama."
    read -p "Continuare comunque? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Crea virtual environment se non esiste
BACKEND_DIR="$(dirname "$0")/../../backend"
cd "$BACKEND_DIR"

if [ ! -d "venv" ]; then
    echo "📦 Creazione ambiente virtuale Python..."
    python3 -m venv venv
fi

# Attiva virtual environment
source venv/bin/activate

# Installa dipendenze Python
echo "📦 Installazione dipendenze Python..."
pip install -r requirements.txt

# Controlla/installa modelli Ollama
if command -v ollama &> /dev/null; then
    echo "🤖 Controllo modelli Ollama..."
    ollama list | grep -q "llama3" || ollama pull llama3
    ollama list | grep -q "nomic-embed-text" || ollama pull nomic-embed-text
fi

echo "✅ Configurazione completata!"
echo "Ora puoi avviare LLM Wiki normalmente."
