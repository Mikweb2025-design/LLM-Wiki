# 🚀 Deploy LLMWiki — Web + Electron App

> Guida definitiva per buildare e deployare **sempre dentro l'app Electron**. Aggiornata al 02/09/2026 con fix pypdf, streaming, cache backend.

---

## 1. Architettura

```
LLMWiki/
├── backend/               FastAPI (porta 8000) — RAG, ChromaDB, OCR
│   ├── app/main.py        Lifespan + prewarm vector_store
│   └── data/documents/    Sorgente documenti versionati (81 file)
├── frontend/              React 18 (dev:3000, build: frontend/build/)
├── frontend-build/        Copia servita da Electron (serve-build.js → :3456)
├── electron/
│   ├── main.js            Avvia backend (venv) + frontend statico + splash
│   ├── serve-build.js     Server statico SPA su :3456
│   └── dist/mac-arm64/    .app + .dmg pacchettizzati (app.asar + extraResources)
└── ~/Library/Application Support/llm-wiki-desktop/
    ├── backend/           Copia *writable* di backend (DMG è read-only)
    │   ├── venv/          Venv isolato con requirements.txt
    │   └── data/documents/
    └── backend.log        Log Electron backend
```

**Porte:**
- `:8000` backend API (sia manuale che Electron → `127.0.0.1`)
- `:3456` frontend Electron (extraResources)
- `:3000` frontend manuale (`npm start` o `node serve-build.js`)

---

## 2. Prerequisiti

```bash
Python 3.13  (/Library/Frameworks/Python.framework/Versions/3.13/bin/python3)
Node 18+
brew install tesseract poppler  # OCR PDF/immagini
ollama serve & ollama pull nomic-embed-text  # embeddings
# IONOS opzionale: backend/.env → IONOS_API_KEY
```

---

## 3. Sviluppo (hot-reload)

```bash
# Terminale 1 — backend
cd backend
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminale 2 — frontend
cd frontend
npm start  # → http://localhost:3000

# Test veloce
curl http://localhost:8000/health
curl http://localhost:8000/api/documents/stats
```

---

## 4. Build di produzione (OBBLIGATORIO ad ogni modifica)

> **Regola d'oro:** `frontend/build` e `frontend-build` sono *diversi*. `electron-builder` pacchettizza `frontend-build` (extraResources), non `frontend/build`.

```bash
# 1. Frontend React → frontend/build
cd frontend
npm run build          # genera main.XXXXXXXX.js

# 2. Sincronizza la cartella servita
rm -rf ../frontend-build/*
cp -r build/* ../frontend-build/

# 3. Verifica
grep -c "stream" ../frontend-build/static/js/main.*.js  # deve essere >=1
cat ../frontend-build/asset-manifest.json | grep main.js

# 4. electron/dist viene rigenerato solo con electron-builder (vedi §5)
```

### Cache backend Electron
`electron/main.js:ensureWritableBackend()` copia `backend/` in `~/Library/Application Support/llm-wiki-desktop/backend` **solo se** un file tra `main.py`, `database.py`, `vector_store.py`, `document_processor.py`, `llm_handler.py`, `chat.py`, `documents.py` è più nuovo. Dopo aver patchato quei file:

```bash
rm -rf ~/Library/Application\ Support/llm-wiki-desktop/backend  # forza ricopia al prossimo avvio
```

---

## 5. Electron — Build & Run

### Dev (usa sorgenti live, no DMG)
```bash
cd electron
npm start              # carica frontend-build su :3456 + backend su :8000
npm run dev            # alternativa: usa http://localhost:3000 come frontend
```

### Pacchettizzato (DMG per distribuzione)
```bash
cd electron
npm run build:mac      # → electron/dist/mac-arm64/LLM Wiki.app + .dmg

# Se hai modificato frontend o backend DOPO l'ultimo build:mac,
# devi patchare l'artifact senza rifare tutto il build (veloce):
APP_RES="dist/mac-arm64/LLM Wiki.app/Contents/Resources"
rm -rf "$APP_RES/frontend-build" && cp -r ../../frontend-build "$APP_RES/frontend-build"
mkdir -p "$APP_RES/backend" && cp -r ../../backend/app "$APP_RES/backend/app"
cp ../../backend/requirements.txt "$APP_RES/backend/"
cp ../../backend/.env "$APP_RES/backend/" 2>/dev/null || true
# main.js è dentro app.asar → unpack, patch, repack:
npx @electron/asar extract "$APP_RES/app.asar" /tmp/asar_fix
cp main.js /tmp/asar_fix/main.js && cp serve-build.js /tmp/asar_fix/
npx @electron/asar pack /tmp/asar_fix "$APP_RES/app.asar"
xattr -cr "dist/mac-arm64/LLM Wiki.app"
open "dist/mac-arm64/LLM Wiki.app"
```

**Cosa contiene `app.asar`:** solo `main.js`, `serve-build.js`, `package.json`. Tutto il resto (`frontend-build`, `backend/app`, `.env`) è in `extraResources` fuori da asar (vedi `electron/package.json:build.extraResources`).

---

## 6. Dati & Migrazione

### Backend manuale vs Electron (store isolati)
- `backend/data/documents/` → usato da `python -m uvicorn` manuale
- `~/Library/.../llm-wiki-desktop/backend/data/documents/` → usato dall'app

Alla prima installazione Electron la cartella è vuota → **0 documenti**. Sincronizza:

```bash
SRC="backend/data/documents"
DST="$HOME/Library/Application Support/llm-wiki-desktop/backend/data/documents"
mkdir -p "$DST" && cp -n "$SRC"/* "$DST"/
# poi dall'app: Documenti → Scansiona  oppure via API:
curl -X POST http://127.0.0.1:8000/api/documents/scan
# poll
curl http://127.0.0.1:8000/api/documents/scan-status
```

### ChromaDB & SQLite
- `backend/chroma_db/` (manuale) vs `~/.../backend/chroma_db/` (Electron) — non condividere tra i due, ogni backend ha il suo vector store.
- DB: `data/wiki.db` separato per lo stesso motivo.

---

## 7. Troubleshooting

| Sintomo | Causa | Fix |
|---|---|---|
| `No module named 'pypdf'` in `scan-status.errors` | `requirements.txt` senza `pypdf` (fixato: `pypdf>=4.0.0` aggiunto) | `~/.../backend/venv/bin/pip install pypdf` + restart app |
| Frontend non aggiorna in Electron (vecchio `main.XXXX.js`) | `frontend/build` ≠ `frontend-build` | `rm -rf frontend-build/* && cp -r frontend/build/* frontend-build/` + patch `$APP_RES/frontend-build` |
| Backend non aggiorna dopo modifica `.py` | `isSourceNewer` guardava solo `main.py` | Ora controlla 8 file (vedi `electron/main.js:131`). Se serve, `rm -rf ~/.../backend` |
| `Port 8000 already in use` | Due backend (manuale + Electron) | `lsof -ti :8000 \| xargs kill -9` poi riapri solo l'app |
| `BV: scan 0/0` dopo restart | Scan precedente interrotto | `curl -X POST :8000/api/documents/scan` |
| Contrasto basso in Confronta | CSS `text-secondary` su diff | Fixato in `CompareDocuments.jsx:242` → `text-primary` / `#ffcc88` |
| DMG non parte dopo patch | Firme xattr | `xattr -cr "LLM Wiki.app"` |

**Log:**
```bash
cat ~/Library/Application\ Support/llm-wiki-desktop/backend.log
cat ~/Library/Logs/LLM\ Wiki.log
cat /tmp/llmwiki_backend.log  # solo backend manuale
```

---

## 8. Release su GitHub

```bash
cd /Users/daniele/Downloads/Documents/opencode/LLMWiki
# 1. assicurati che la build sia fresca
cd frontend && npm run build && rm -rf ../frontend-build/* && cp -r build/* ../frontend-build/ && cd ..
# 2. commit
git add backend/ electron/main.js frontend/src/ frontend-build/ DEPLOY.md
git commit -m "perf: batch embeddings + RRF search + streaming + pypdf fix + electron cache"
git push origin main  # o HEAD:main se branch diverso
# 3. tag opzionale
git tag v1.1.0 && git push --tags
# 4. DMG in Releases
open electron/dist/mac-arm64/*.dmg
```

`.gitignore` esclude `frontend/build/` e `electron/dist/`; `frontend-build/` è versionato di proposito (serve all'app pacchettizzata).

---

## 9. Performance introdotte (02/09/2026)

- **Vector DB:** batch `add_document_to_store` (32), RRF fusion + TF-IDF, cache snapshot 5min
- **LLM:** context 500 → 12000 char, history 6 turni, streaming SSE (`/api/chat/stream`)
- **DB:** indici su `extension/created_at`, `get_stats_aggregates()` SQL (1 query vs O(N) Python)
- **Frontend:** debounce 400ms su Ricerca, `isStreaming` toggle, `main.*.js` 415KB gzip 118KB
- **Docs:** `pypdf` aggiunto, Excel streaming `read_only`, PPTX/CSV/HTML estrattori

---

## 10. Checklist pre-push

- [ ] `frontend/build` + `frontend-build` allineati (`asset-manifest.json` stesso hash)
- [ ] `$APP_RES/frontend-build` allineato se `dist/` è stato patchato a mano
- [ ] `backend/requirements.txt` contiene `pypdf`
- [ ] `~/.../backend` ricopiato o `isSourceNewer` aggiornato
- [ ] `curl :8000/api/documents/count` >0 dopo scan
- [ ] `curl :3456` → `main.<hash>.js` corretto
```

