# 🗺️ LLMWiki Roadmap

> Living roadmap — priorities can shift based on feedback. Contributions welcome!

## ✅ Done (v1.1 — 2026-09-02)

- Hybrid search (Chroma semantic + TF-IDF keyword → RRF fusion)
- Batched embeddings (32 chunks) + streaming SSE chat (`/api/chat/stream`)
- SQL aggregates for Dashboard, paginated docs, debounce search
- Tags & Favorites, document compare high-contrast fix
- Multi-language UI (IT / EN / DE) with flag switcher top-right
- Electron cache invalidation (multi-file), `pypdf` dep fix

## ✅ Done (v1.2 — 2026-09-02) — Grafici Configurabili

- `GET /api/analytics/presets` + `POST /api/analytics/extract|aggregate` — template fatture/spese/stipendi/custom, Excel/CSV diretto o LLM+regex fallback
- Analytics UI (`Grafici` tab): multi-select documenti, preset, campo importo, raggruppa per (mese/categoria/fornitore), tipo grafico (Bar/Line/Pie/Table), SVG custom senza dipendenze
- Chat fix: stale closure Dashboard Insights, Quick Actions navigation, TypeError + sum_field fallback per grafici vuoti

---

## ✅ Done — Q2 2026: Grafici Intelligenti da Chat (2026-09-02)

**Goal:** Chiedi in chat “fammi un grafico di tutti i miei guadagni” o “quanto ho speso per benzina? fammi un grafico” e ottieni risposta + grafico auto-generato.

| Feature | Description | Status |
|---|---|---|
| **Intent detection** | Backend chat rileva `grafico|chart|quanto ho speso|guadagn|benzina|spese` (IT/EN/DE) e triggera estrazione analytics sui documenti rilevanti al contesto. | ✅ Done |
| **Auto-preset** | `guadagn|stipend|earnings` → `stipendi` (sum `importo_lordo`), `benzina|cibo|spesa` → `spese` (filter categoria), default `fatture`. `group_by` auto da query (`mese|month` → month). | ✅ Done |
| **Inline chart** | Risposta chat include `chart_data` renderizzato come Bar/Line/Pie sotto il testo (stesso SVG di Analytics). Streaming: chart inviato come evento finale `done`. | ✅ Done |
| **Configurazione utente** | In **Grafici** tab l’utente definisce template custom (campi + prompt) che la chat riusa. | ✅ Done |
| **Esempi** | `“Fammi un grafico di tutti i miei guadagni”` → stipendi per mese; `“Quanti soldi ho speso per benzina?”` → spese filtrate categoria=benzina per mese; `“Fammi un grafico delle spese per categoria”` → pie per categoria. | ✅ Done |

### Technical notes

```
Chat: "quanto ho speso per benzina? fammi un grafico"
  → detect_chart_intent() → true, preset=spese, filter=categoria:benzina, group_by=month
  → search_documents(query, 8) → filenames rilevanti
  → analytics.aggregate(filenames, preset, sum_field, group_by) → chart_data
  → ChatResponse {answer, sources, chart: {chart_data, total, group_by}}
Frontend Chat: if chart → render BarChart/PieChart sotto bubble
```

```
POST /api/chat/ {message: "fammi un grafico..." } → {answer, sources, chart: {...}}
POST /api/chat/stream → SSE ... → data: {"done":true, "chart":{...}}
```

---

## ✅ Done — Q2 2026: Nextcloud / WebDAV Source (2026-09-03)

**Goal:** Use your Nextcloud as a live document source — no manual upload.

| Feature | Description | Status |
|---|---|---|
| **Nextcloud login** | `user / app-password` form in **Folders → Add WebDAV**. Validated via `PROPFIND` on `https://<host>/remote.php/dav/files/<user>/`. Stored encrypted (Fernet `.webdav_key` o b64 fallback). | ✅ Done |
| **Folder picker** | After login, `PROPFIND Depth:1` lists folders. User checks which to index (e.g. `/Documents`, `/Shared`). Persisted in `webdav_sources` + `remote_path` + `url`, `username`. Breadcrumb + navigazione cartelle. | ✅ Done |
| **Incremental sync** | `PROPFIND` + `getetag` per file. Only new/changed `etag` re-indexed; deleted files auto-removed from Chroma + DB. Cache `data/webdav_cache/<id>/`. | ✅ Done |
| **Auth variants** | App-password first. Later: **OAuth2 / Nextcloud Login Flow v2** (token, no password). | Planned (app-password done) |
| **Filters** | By extension (PDF, Office…), by size, ignore `.hidden`, regex. | ✅ Done (ext filter + max_files) |
| **UI** | **Folders** mostra WebDAV badge + sync status + “Sync now” + “Sync tutte”; **Documents** shows source icon (☁️ Nextcloud vs 💾 Locale). | ✅ Done |

### Technical notes

```http
PROPFIND /remote.php/dav/files/alice/Documents HTTP/1.1
Depth: 1
Authorization: Basic ...
```
Response → `207 Multi-Status` XML → parse `<d:href>`, `<d:getetag>`, `<d:getcontentlength>`, `<d:resourcetype>`.

- Download via `GET` with same auth, then `process_document()` → `add_document_to_store()`.
- No data copy: only metadata + embeddings stored locally; files stay on Nextcloud.
- Future: `OCS Share API` for shared folders, `WebDAV REPORT` for changes feed instead of polling.

```
Frontend (Folder picker) → POST /api/webdav/connect {url, user, password}
                       → POST /api/webdav/sync {folder_id}
Backend                → WebDAVClient (a`iohttp` + `lxml`) → process → Chroma
```

---

## ✅ Done — Q3 2026: Traduzione UI Completa (2026-09-03)

**Goal:** Tutte le voci di menu e contenuti tradotti IT/EN/DE — non solo i tab.

| Feature | Description | Status |
|---|---|---|
| **Full i18n dictionary** | `frontend/src/utils/i18n.js` esteso da ~30 a ~250 chiavi: `common`, `dashboard`, `chat`, `documents`, `folders/webdav`, `search`, `upload`, `analytics`, `compare`, `export`, `settings`, `system`, `diagnostic`, `shortcuts`, `history`, `preview`, `roadmap`. | ✅ Done |
| **Component refactor** | 14 componenti migrati a `useI18n` + `t(lang,key)`: `Dashboard`, `Chat`, `DocumentList`, `UploadForm`, `Folders` (locale+WebDAVPanel), `SearchWithFilters`, `Analytics`, `CompareDocuments`, `ExportChat`, `Settings`, `SystemStatus`, `DiagnosticPanel`, `KeyboardShortcuts`, `FilePreview` + badge sorgente `☁️ Nextcloud / 💾 Locale`. | ✅ Done |
| **Build** | `npm run build` 137.45 kB gz, `frontend-build` sincronizzato, 18 file con `useI18n`, locale-aware `toLocaleString(lang)` e `speechSynthesis.lang`. | ✅ Done |

---

## 🚧 In Progress — Q3 2026: OCR Hybrid + Citations 2.0

**Goal:** Scanned PDFs leggibili anche se Tesseract fallisce, e risposte citano `file.pdf p.3` con highlight.

| Feature | Description | Status |
|---|---|---|
| **OCR Hybrid** | `document_processor.py`: `pypdf` text → per-pagina `Tesseract`; se <50 chars prova `IONOS Vision` (`meta-llama/Llama-3.2-11B-Vision-Instruct`, `data:image/png;base64`). Config `IONOS_VISION_MODEL`, `OCR_HYBRID_ENABLED`, `OCR_MIN_CHARS_PER_PAGE`. Funzioni `get_pdf_pages()` + `_ionos_vision_ocr()`. | ✅ Backend done, frontend wiring next |
| **Citations 2.0** | `vector_store.py` page-aware chunks (`metadata.page`), `llm_handler.py` context `file.pdf p.3` + system prompt cita `filename p.N`, `chat.py` sources includono `page`+`highlight`. Viewer highlight via `#page=N` + snippet. | ✅ Backend done, viewer highlight next |
| **Users & Roles** | Nextcloud SSO (OpenID) → `viewer / editor / admin`. Per-folder ACL. | 🔮 Planned (Q3) |
| **Export PDF** | Chat export TXT/JSON/MD già done; aggiungere PDF `Q&A + sources + chart` via `reportlab` endpoint `POST /api/chat/export/pdf`. | 🔮 Planned (Q3) |

---

## 🔮 Q4 2026

- **Generic WebDAV** — any WebDAV server (ownCloud, Seafile, Synology) via same client — *già coperto dal client WebDAV attuale (httpx+lxml), solo branding*.
- **Full offline pack** — `nomic-embed-text` + Ollama `llama3` bundled, air-gapped mode.
- **Watch mode** — filesystem watcher (`watchdog`) for local folders already; extend to WebDAV push (poll interval configurabile già in `webdav_sources.sync_interval_minutes`).

---

## 💡 How to influence

Open an issue with label `roadmap` or comment on the Roadmap tab in-app. WebDAV/Nextcloud is top priority — if you need a provider sooner, let us know which (Nextcloud vs generic WebDAV).

---

## 📌 See also

- `DEPLOY.md` — how to build & ship the Electron app.
- `README.md` — current features & performance table.
