# 📚 LLM Wiki

Wiki intelligente con chat testuale e vocale per interrogare i tuoi documenti.

![LLM Wiki](screenshots/dashboard.png)

## ✨ Funzionalità

### 💬 Chat Intelligente
- **Chat testuale** - Fai domande sui tuoi documenti in linguaggio naturale
- **Chat vocale** - Registra domande con il microfono
- **Ricerca semantica** - Trova informazioni rilevanti con AI
- **Storia conversazioni** - Consulta le chat precedenti

### 📄 Gestione Documenti
- **Supporto multi-formato** - PDF, Excel, Word, TXT, CSV, immagini (OCR)
- **Scansione automatica** - Indicizza documenti da cartella
- **Upload diretto** - Trascina o carica file dall'interfaccia
- **Gestione cartelle** - Monitora più cartelle contemporaneamente

### 📈 Analisi e Confronto
- **Confronta documenti** - Confronta il contenuto di due file
- **Riassunti AI** - Genera riassunti automatici dei documenti
- **Insights** - Analisi dei temi principali e pattern ricorrenti
- **Dashboard** - Panoramica completa dei tuoi documenti

### 🖥️ Multi-Piattaforma
- **Web App** - Accessibile da browser su qualsiasi dispositivo
- **Desktop App** - Applicazione nativa per macOS, Windows, Linux
- **API REST** - Integra con altri sistemi

## 📸 Screenshots

### Dashboard
![Dashboard](screenshots/dashboard.png)

### Chat
![Chat](screenshots/chat.png)

### Confronto Documenti
![Confronto](screenshots/compare.png)

### Gestione Documenti
![Documenti](screenshots/documents.png)

## 📋 Requisiti

### Backend
- **Python 3.9+**
- **Ollama** (per LLM locale) - https://ollama.ai
- **Tesseract** (per OCR immagini) - `brew install tesseract`

### Frontend
- **Node.js 18+**
- **npm** o **yarn**

### Desktop App (opzionale)
- **Electron** - Incluso nelle dipendenze

## 🚀 Installazione Rapida

### 1. Clone Repository
```bash
git clone https://github.com/Mikweb2025-design/LLM-Wiki.git
cd LLM-Wiki
```

### 2. Installa Backend
```bash
cd backend
pip install -r requirements.txt
```

### 3. Installa Frontend
```bash
cd frontend
npm install
```

### 4. Configura Ollama
```bash
# Installa Ollama (da https://ollama.ai)
ollama pull llama3
ollama pull nomic-embed-text
```

### 5. Avvia l'App
```bash
# Opzione 1: Script automatico
chmod +x start.sh
./start.sh

# Opzione 2: Avvio manuale
# Terminale 1 - Backend
cd backend
uvicorn app.main:app --reload

# Terminale 2 - Frontend
cd frontend
npm start
```

## 📁 Struttura Progetto

```
LLM-Wiki/
├── backend/                    # Server FastAPI
│   ├── app/
│   │   ├── routers/           # API endpoints
│   │   │   ├── chat.py       # Chat e conversazioni
│   │   │   ├── documents.py  # Gestione documenti
│   │   │   ├── voice.py      # Elaborazione vocale
│   │   │   └── status.py     # Stato sistema
│   │   ├── utils/
│   │   │   ├── document_processor.py  # Estrazione testo
│   │   │   ├── vector_store.py        # ChromaDB embeddings
│   │   │   ├── llm_handler.py         # Gestione LLM
│   │   │   └── database.py            # SQLite database
│   │   └── models/           # Modelli dati
│   ├── data/documents/       # Cartella documenti
│   └── requirements.txt      # Dipendenze Python
├── frontend/                  # App React
│   ├── src/
│   │   ├── components/       # UI Components
│   │   │   ├── Dashboard.jsx
│   │   │   ├── ChatInterface.jsx
│   │   │   ├── CompareDocuments.jsx
│   │   │   ├── DocumentList.jsx
│   │   │   └── UploadForm.jsx
│   │   ├── hooks/           # Custom hooks
│   │   └── utils/           # Utilities
│   └── package.json
├── electron/                  # App Desktop
│   ├── main.js              # Entry point Electron
│   ├── serve-build.js       # Server per build
│   └── package.json
├── screenshots/              # Screenshots documentazione
├── start.sh                 # Script avvio rapido
├── install.sh               # Script installazione
└── README.md                # Questo file
```

## 🔧 Configurazione

### Variabili Ambiente Backend

Crea un file `.env` nella directory `backend/`:

```bash
# URL Ollama (default: http://localhost:11434)
OLLAMA_BASE_URL=http://localhost:11434

# Modello LLM (default: llama3)
OLLAMA_MODEL=llama3

# Host server (default: 0.0.0.0)
HOST=0.0.0.0

# Porta server (default: 8000)
PORT=8000

# Modello embeddings (default: nomic-embed-text)
OLLAMA_EMBED_MODEL=nomic-embed-text
```

### Configurazione Frontend

Modifica `frontend/src/utils/api.js` per cambiare l'URL del backend:

```javascript
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
```

## 📖 Uso

### Caricare Documenti

1. Avvia l'app su http://localhost:3000
2. Vai alla scheda **📤 Carica**
3. Trascina file o clicca per selezionarli
4. Oppure copia file in `backend/data/documents/` e clicca **🔄 Scansiona Cartella**

### Chat

1. Vai alla scheda **💬 Chat**
2. Scrivi una domanda o clicca **🎤** per registrare
3. Ricevi risposte con fonti dai documenti

### Confronto Documenti

1. Vai alla scheda **📈 Confronta**
2. Seleziona due documenti dalla lista
3. Clicca **🔍 Confronta Documenti**
4. Visualizza le differenze evidenziate

### Formati Supportati

| Tipo | Estensioni | Note |
|------|------------|------|
| PDF | .pdf | Testo direct + OCR per scansioni |
| Immagini | .png, .jpg, .jpeg, .tiff, .bmp | Richiede Tesseract |
| Excel | .xlsx, .xls | Tutti i fogli |
| Word | .docx | Paragrafi e tabelle |
| Testo | .txt, .csv, .md | UTF-8 |

## 🛠️ Sviluppo

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --debug
```

Il server sarà disponibile su http://localhost:8000
Documentazione API: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm start
```

Il frontend sarà disponibile su http://localhost:3000

### Desktop App

```bash
cd electron
npm install
npm start           # Sviluppo
npm run build       # Build per distribuzione
```

## 🐛 Troubleshooting

### Ollama non connesso
```bash
# Avvia Ollama
ollama serve

# Scarica modelli
ollama pull llama3
ollama pull nomic-embed-text
```

### Errore OCR
```bash
# macOS
brew install tesseract tesseract-lang

# Ubuntu/Debian
sudo apt-get install tesseract-ocr tesseract-ocr-ita

# Windows
# Scarica da https://github.com/UB-Mannheim/tesseract/wiki
```

### Porta già in uso
```bash
# Cambia porta backend
PORT=8001 ./start.sh

# O modifica .env
echo "PORT=8001" > backend/.env
```

### Build fallito
```bash
# Clear cache
cd frontend
rm -rf node_modules build
npm install
npm run build
```

## 📊 Performance

- **Cache documenti** - Testo estratto cachato per 30 minuti
- **Truncamento intelligente** - Documenti grandi troncati a 50KB
- **Limite righe confronto** - Massimo 1000 righe per confronto
- **Compressione gzip** - Risposte API compresse
- **Pre-warm** - ChromaDB inizializzato in background

## 🔒 Sicurezza

- **CORS configurato** - Solo origini autorizzate
- **File size limit** - Massimo 50MB per upload
- **Validazione input** - Tutti i parametri validati
- **Error handling** - Gestione errori robusta

## 📄 Licenza

MIT License - Vedere file LICENSE per dettagli.

## 🤝 Contribuire

1. Fork il progetto
2. Crea una branch per la feature (`git checkout -b feature/nuova-feature`)
3. Commit le modifiche (`git commit -m 'Aggiungi nuova feature'`)
4. Push alla branch (`git push origin feature/nuova-feature`)
5. Apri un Pull Request

## 📞 Supporto

- **Issues**: https://github.com/Mikweb2025-design/LLM-Wiki/issues
- **Email**: supporto@example.com

## 🙏 Ringraziamenti

- [Ollama](https://ollama.ai) - LLM locale
- [FastAPI](https://fastapi.tiangolo.com/) - Backend framework
- [React](https://reactjs.org/) - Frontend framework
- [ChromaDB](https://www.trychroma.com/) - Vector database
- [Electron](https://www.electronjs.org/) - Desktop framework
