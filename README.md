# 📚 LLM Wiki

> Intelligent RAG wiki — chat (text + voice) over your documents. Fast hybrid search, streaming answers, auto-tagged library, configurable charts — even from chat.

![LLM Wiki](screenshots/dashboard.png)

![Python](https://img.shields.io/badge/Python-3.13-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.136-green) ![React](https://img.shields.io/badge/React-18-61dafb) ![Electron](https://img.shields.io/badge/Electron-35-47848f) ![License](https://img.shields.io/badge/License-MIT-yellow)

---

## ✨ Features

### 💬 Intelligent Chat
- **Text chat** with citations — grounded in your docs
- **Streaming SSE** (`POST /api/chat/stream`) — token-by-token, toggle `stream` in header (default off for stability)
- **Voice input** → Vosk offline STT + WebSpeech fallback
- **Conversation memory** — last 6 turns
- **History** persisted in SQLite (`GET /api/chat/history`)
- **Smart charts from chat** — ask *“show me a chart of all my earnings”* (`fammi un grafico di tutti i miei guadagni`) or *“how much did I spend on fuel? show me a chart”* (`quanto ho speso per benzina? fammi un grafico`) → `POST /api/chat/` returns `{answer, sources, chart}` rendered inline as mini bar chart (auto preset `stipendi`/`spese`, group by month, cached 1h, parallel 4 workers: 50s → 14s cold, 6s cached)

### 📄 Document Management
- **Multi-format**: PDF (native + OCR), images (Tesseract), Excel (streaming), Word, PPTX, CSV, HTML/MD, TXT
- **Batch + cached ingestion**: 30-min mtime cache, batched Chroma embeddings (32/batch)
- **Auto-scan** `backend/data/documents/` + custom folders (`POST /api/documents/scan-custom`)
- **Drag & drop upload** (50 MB) + background scan with progress (`/scan-status`)
- **Auto-tag** — on upload/scan every doc is classified (`fattura`, `stipendio`, `contratto`, `assicurazione`, `bolletta`, `identità`, `medico`, `legale`, `foto`, `altro`) via keyword + snippet; filter by tag in Documents, `POST /auto-tag/all` for bulk

### 🔍 Hybrid Search
- **Semantic** (`nomic-embed-text` + Chroma) **+ TF-IDF keyword** fused via **RRF (k=60)**
- Stop-word filtering, `k≤20`, 500-hit prune — no more `score=-matches`
- Filter by extension/filename/tag, debounced 400 ms

### 📊 Analytics & Charts — user-configurable
- **Analytics tab** (`Charts`): multi-select docs, preset (`fatture`/`spese`/`stipendi`/`custom`), **field selector** (`importo`/`importo_netto`/`importo_lordo`), group by (`month`/`categoria`/`fornitore`), chart type (Bar/Line/Pie/Table) — SVG custom, no external dep, `POST /api/analytics/aggregate` with `sum_field` override
- **Excel/CSV** parsed directly (no LLM), **PDF** via LLM JSON + regex fallback + **parallel 4 workers + cache** (36s → 9s)
- **Table + JSON copy** + raw rows preview

### 📈 Compare & Insights
- **Side-by-side compare** high-contrast diff
- **AI summaries** (`/summary/{file}`) and **insights** (cached 10 min, fixed stale-closure bug)
- **Similar documents** (`/similar/{file}` + `/related`)
- **Tags & Favorites** — `POST /{file}/tags`, `POST /{file}/favorite`, `GET /tags/map` for UI

### 🌍 Multi-Language
- **IT / EN / DE** flag switcher top-right, persisted in `localStorage`, all tabs + Analytics + Roadmap translated via `frontend/src/utils/i18n.js`

### 📊 Dashboard
- Real-time stats via **single SQL aggregate** (`COUNT+SUM+GROUP BY`)
- Charts by type, recent docs (8), activity timeline, **Quick Actions** now navigate correctly (`onNavigate` prop)

### 🖥️ Cross-Platform
- **Web** `http://localhost:3000` / `http://127.0.0.1:3456`
- **Desktop** macOS/Win/Linux via Electron (extraResources, isolated userData venv)
- **REST API** `http://localhost:8000/docs`

---

## 📸 Screenshots

| Dashboard (tag filter) | Chat (chart inline) | Analytics (bar) | Documents (auto-tag) |
|---|---|---|---|
| ![Dashboard](screenshots/dashboard.png) | ![Chat](screenshots/chat.png) | ![Analytics](screenshots/compare.png) | ![Documents](screenshots/documents.png) |

*Screenshots rebuilt 2026-09-02 — `main.46b83e82.js` (127.6 kB gzip)*

---

## 🚀 Performance (what's new in v1.3 — 2026-09-04)

| Area | Before | After | File |
|---|---|---|---|
| **Retrieval accuracy** | RRF tie (semantic vs keyword `1/61` = same score) | **post-RRF boost** exact-phrase ×1.8, filename ×1.4 + tie-break on `kw_score` | `vector_store.py` |
| **Result diversity** | top-8 often same PDF | **MMR-lite**: max 2 chunks per doc | `vector_store.py` |
| **Keyword search** | substring `O(N·L)` + IT-only stopwords | **token-set `O(1)`** + IT/EN/DE stopwords, substring fallback only ≥5 chars | `vector_store.py` |
| **Search cache** | TTL 120s, 128 entries, raw key | **TTL 300s, 256 entries, normalized key** (punctuation/spaces) | `vector_store.py` |
| **Chart doc filter** | `get_all_documents()` + Python filter | **SQL `LIKE`** via `get_filenames_by_keywords()` / `get_recent_filenames()` | `database.py`, `chat.py` |
| **LLM context** | flat `1.8k`/doc | **score-weighted**: top-2 docs 2.2k, rest 1.4k (total 12k) | `llm_handler.py` |
| **LLM params** | fixed temp 0.3 / 2048 tokens | **adaptive**: factual queries → temp 0.1 + 1024 tokens (faster, fewer hallucinations) | `llm_handler.py` |
| **Electron server** | `url.parse` (deprecated), no cache/compression | **WHATWG URL + ETag/304 + gzip** (7500 → 68 B on test asset) | `electron/serve-build.js` |
| **Electron app** | no single-instance, aggressive port kill, fragile splash, unbounded log, no menu | **single-instance**, own-backend-only port kill, safe splash, 5 MB log rotation, native menu + Help, `sandbox` + `preload.js`, window-bounds persistence, crash logging, `llm-wiki://` protocol, hardened runtime + entitlements | `electron/main.js`, `package.json` |

Measured: `2000 chunks` keyword scan in ~3 ms, `main.c7482441.js` frontend, DMG/ZIP 101 MB arm64.

## 🚀 Performance (what's new in v1.2 — 2026-09-02)

| Area | Before | After | File |
|---|---|---|---|
| **Search** | keyword `O(N)` + `k=40` | **RRF + TF-IDF**, stopwords, `k≤20`, 500 prune | `vector_store.py:109` |
| **Embeddings** | one `add_texts` (OOM) | **batched 32** | `vector_store.py:47` |
| **LLM context** | `500` chars/doc | **`12k` total / `1.8k` per doc + 6 turns** | `llm_handler.py:14` |
| **Chat** | blocking | **SSE** + default off (was hanging) | `chat.py:55`, `Chat.jsx:98` |
| **Chart from chat** | N/A (50s) | **detect strict `grafico|chart` + cache + parallel 4 → 14s cold, 6s cached** | `chat.py:16`, `analytics.py:16` |
| **Analytics extract** | sequential 12×3s = 36s | **ThreadPool 4 + cache 1h → 9s** | `analytics.py:220` |
| **Excel** | full RAM | **`read_only` streaming** | `document_processor.py:42` |
| **DB stats** | `get_all_documents()` loop | **SQL aggregate** | `database.py:256` |
| **Docs list** | unpaginated | **`limit/offset/filter/sort` + tag filter** | `documents.py:146` |
| **Auto-tag** | manual | **keyword auto on upload/scan + bulk `/auto-tag/all`** | `auto_tagger.py:1`, `documents.py:267` |
| **Contrast** | `text-secondary` barely visible | **`text-primary/#ffcc88`** | `CompareDocuments.jsx:242` |
| **Cache** | doc TTL 30m | **+ snapshot 5m + extract 1h** | `document_processor.py:10`, `analytics.py:16` |
| **Deps** | `pypdf` missing | **`pypdf>=4.0.0`** | `requirements.txt:8` |

Measured: `127.6 kB` gzip frontend, `SQLite 1 query` for stats, `81 docs` auto-tagged in <10s.

---

## 📋 Requirements

### Backend
- **Python 3.13** (3.9+ works)
- **Ollama** — `nomic-embed-text` + `llama3` fallback
- **Tesseract + Poppler** — `brew install tesseract tesseract-lang poppler`

### Frontend
- **Node.js 18+**

### Desktop
- **Electron 35**

---

## ⚡ Quick Start

```bash
git clone https://github.com/Mikweb2025-design/LLM-Wiki.git
cd LLM-Wiki
cd backend && pip install -r requirements.txt && cd ..
cd frontend && npm install && cd ..
ollama pull llama3 && ollama pull nomic-embed-text && ollama serve &
./start.sh
# or
#   backend:  python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
#   frontend: npm start
```

App: **http://localhost:3000** or **http://127.0.0.1:3456** (Electron) · API: **http://localhost:8000/docs**

---

## 🔧 Configuration

`backend/.env`:

```bash
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
OLLAMA_EMBED_MODEL=nomic-embed-text
IONOS_API_KEY=...            # primary LLM
IONOS_MODEL=meta-llama/Llama-3.3-70B-Instruct
IONOS_BASE_URL=https://openai.inference.de-txl.ionos.com/v1
HOST=0.0.0.0
PORT=8000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3456,http://127.0.0.1:3000
```

---

## 📁 Project Structure

```
LLM-Wiki/
├── backend/
│   ├── app/
│   │   ├── main.py              # prewarm, GZip, CORS, Server-Timing
│   │   ├── routers/
│   │   │   ├── chat.py          # /api/chat + /stream + smart chart intent
│   │   │   ├── analytics.py     # /api/analytics/* (presets/extract/aggregate) + cache+parallel
│   │   │   ├── documents.py     # upload/scan/tags/auto-tag/paginated
│   │   │   ├── voice.py
│   │   │   └── status.py
│   │   ├── utils/
│   │   │   ├── auto_tagger.py       # keyword auto-tag (fattura/stipendio/...)
│   │   │   ├── document_processor.py
│   │   │   ├── vector_store.py
│   │   │   ├── llm_handler.py
│   │   │   └── database.py
│   │   └── models/schemas.py    # ChatResponse.chart
│   ├── data/documents/          # 81 docs
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx        # + tag filter, fixed insights closure
│   │   │   ├── Chat.jsx             # ChatMiniChart + streaming toggle (default off)
│   │   │   ├── Analytics.jsx        # Bar/Line/Pie/Table + sum_field selector
│   │   │   ├── DocumentList.jsx     # tagsMap, Auto-Tag button, tag filter
│   │   │   ├── Roadmap.jsx
│   │   │   └── ...
│   │   ├── utils/
│   │   │   ├── i18n.js              # IT/EN/DE dict + flag switcher
│   │   │   └── api.js               # chatApi.stream + documentsApi
│   │   └── index.css
│   └── build/  → NOT versioned
├── frontend-build/  # versioned copy for Electron
├── electron/
│   ├── main.js      # multi-file isSourceNewer, venv, port kill
│   └── dist/mac-arm64/ # .app + .dmg
├── ROADMAP.md   # Nextcloud/WebDAV + smart charts
├── DEPLOY.md
└── README.md
```

---

## 🔌 API Reference

### Chat
- `POST /api/chat/` — `{message, history?, model?, lang?}` → `{answer, sources, model, chart?}` (`chart` present when `grafico|chart|diagramm` detected, lang `it|en|de`)
- `POST /api/chat/stream` — SSE `data: {"token": "..."}` + `{"done":true, sources, chart?}`
- `GET /api/chat/history` / `models`

### Analytics (Charts)
- `GET /api/analytics/presets` — `{fatture, spese, stipendi, custom}`
- `POST /api/analytics/extract` — `{filenames, preset, custom_fields?, custom_prompt?, use_llm?}` → `{results:[{extracted, source}]}`
- `POST /api/analytics/aggregate` — `{filenames, preset, group_by, sum_field?, use_llm?}` → `{chart_data:[{label, value, count}], total, rows}`

### Documents
- `POST /api/documents/upload` (50 MB)
- `GET /api/documents/?limit&offset&extension&q&sort` — paginated
- `GET /api/documents/paginated` + `count`
- `POST /api/documents/scan` (bg) + `GET /scan-status`
- `POST /api/documents/scan-custom` + `/folders` CRUD
- `GET /api/documents/content/{file}?max_length=50000`
- `GET /api/documents/summary/{file}` / `insights?refresh=1` / `similar/{file}`
- `POST /api/documents/auto-tag/all?force=false` + `POST /auto-tag/{file}` + `GET /tags` + `GET /tags/map` + `GET /tags/{tag}` + `POST /{file}/tags` + `POST /{file}/favorite`
- `DELETE /{file}` / `batch`

### System
- `GET /health` / `health/full` / `metrics` / `api/status/`

---

## 📖 Usage

1. **Upload**: drag & drop in **Upload** or copy to `backend/data/documents/` → **Scan** (auto-tagged)
2. **Chat**: type or 🎤 — try *“show me a chart of all my earnings”* or *“how much did I spend on fuel? show me a chart”* → inline chart (14s cold, 6s cached)
3. **Analytics**: **Charts** tab → select docs → preset → field (`importo_lordo` for stipendi) → group by → **Generate**
4. **Search**: debounced, filter by type/size/tag
5. **Documents**: filter by tag (`fattura` 40, `stipendio` 22), **Auto-Tag** button, batch reindex
6. **Compare**: pick 2 docs → **Confronta**

Supported: `pdf` · `png/jpg/webp` · `xlsx/xls` · `docx` · `pptx` · `csv` · `html/md` · `txt/rtf`

---

## 🖥️ Desktop (Electron)

```bash
cd electron
npm install
npm start          # dev :3456
npm run dev        # dev :3000
npm run build:mac  # → dist/mac-arm64/LLM Wiki.app + .dmg
```

Sync before `build:mac`:

```bash
cd frontend && npm run build && rm -rf ../frontend-build/* && cp -r build/* ../frontend-build/
```

See **DEPLOY.md** for patch-without-rebuild, cache invalidation, data migration.

---

## 🐛 Troubleshooting

- **Ollama offline**: `ollama serve && ollama pull llama3 && ollama pull nomic-embed-text`
- **OCR fails**: `brew install tesseract tesseract-lang poppler`
- **Port in use**: `lsof -ti :8000 | xargs kill -9`
- **Electron 0 docs**: `cp -r backend/data/documents/* ~/Library/Application\ Support/llm-wiki-desktop/backend/data/documents/ && curl -X POST :8000/api/documents/scan`
- **`pypdf` missing**: fixed; `~/.../backend/venv/bin/pip install pypdf`
- **Stale frontend in .app**: resync `frontend-build` + repack `app.asar`
- **Chat hanging (stream)**: default now **off** — toggle `stream` in header to re-enable
- **Chart 50s**: now **14s cold / 6s cached** via parallel 4 + cache; use **Grafici** tab for instant

---

## 🔒 Security

CORS allowlist, 50 MB cap, GZip, WAL, `Server-Timing`.

---

## 🤝 Contributing

```bash
git checkout -b feat/my-feature
git commit -m "feat: ..."
git push origin feat/my-feature
```

---

## 📄 License

MIT

## 🙏 Credits

[Ollama](https://ollama.ai) · [FastAPI](https://fastapi.tiangolo.com) · [React](https://reactjs.org) · [ChromaDB](https://www.trychroma.com) · [Electron](https://www.electronjs.org) · [IONOS AI](https://www.ionos.com)
