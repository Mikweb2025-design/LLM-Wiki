# 🗺️ LLMWiki Roadmap

> Living roadmap — priorities can shift based on feedback. Contributions welcome!

## ✅ Done (v1.1 — 2026-09-02)

- Hybrid search (Chroma semantic + TF-IDF keyword → RRF fusion)
- Batched embeddings (32 chunks) + streaming SSE chat (`/api/chat/stream`)
- SQL aggregates for Dashboard, paginated docs, debounce search
- Tags & Favorites, document compare high-contrast fix
- Multi-language UI (IT / EN / DE) with flag switcher top-right
- Electron cache invalidation (multi-file), `pypdf` dep fix

---

## 🚧 Next — Q2 2026: Nextcloud / WebDAV Source

**Goal:** Use your Nextcloud as a live document source — no manual upload.

| Feature | Description | Status |
|---|---|---|
| **Nextcloud login** | `user / app-password` form in **Folders → Add WebDAV**. Validated via `PROPFIND` on `https://<host>/remote.php/dav/files/<user>/`. Stored encrypted in backend (keyring) or `.env` for dev. | Planned |
| **Folder picker** | After login, `PROPFIND Depth:1` lists folders. User checks which to index (e.g. `/Documents`, `/Shared`). Persisted in `folders` table with `type='webdav'` + `url`, `username`. | Planned |
| **Incremental sync** | Poll / webhook: `PROPFIND` + `getetag` per file. Only new/changed `etag` re-indexed; deleted files auto-removed from Chroma + DB. Background interval (default 15 min, configurable). | Planned |
| **Auth variants** | App-password first. Later: **OAuth2 / Nextcloud Login Flow v2** (token, no password). | Planned |
| **Filters** | By extension (PDF, Office…), by size, ignore `.hidden`, regex. | Planned |
| **UI** | New tab **Roadmap** documents the flow; **Folders** shows WebDAV badge + sync status + “Sync now”. **Documents** shows source icon (local vs Nextcloud). | Planned |

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

## 🔮 Q3 2026

- **OCR Hybrid** — Tesseract local + IONOS Vision for scanned PDFs fallback.
- **Citations 2.0** — answers include `file.pdf: p. 3` + highlight in preview viewer.
- **Users & Roles** — Nextcloud SSO (OpenID) → `viewer / editor / admin`. Per-folder ACL.
- **Export** — chat export already exists; add PDF export of Q&A with sources.

---

## 🔮 Q4 2026

- **Generic WebDAV** — any WebDAV server (ownCloud, Seafile, Synology) via same client.
- **Full offline pack** — `nomic-embed-text` + Ollama `llama3` bundled, air-gapped mode.
- **Watch mode** — filesystem watcher (`watchdog`) for local folders already; extend to WebDAV push.

---

## 💡 How to influence

Open an issue with label `roadmap` or comment on the Roadmap tab in-app. WebDAV/Nextcloud is top priority — if you need a provider sooner, let us know which (Nextcloud vs generic WebDAV).

---

## 📌 See also

- `DEPLOY.md` — how to build & ship the Electron app.
- `README.md` — current features & performance table.
