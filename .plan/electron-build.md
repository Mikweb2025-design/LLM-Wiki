# Plan: Build LLM Wiki Electron DMG

## Context
The LLM Wiki project already has an `electron/` directory with a previous build (`LLM Wiki-1.0.0-arm64.dmg`, 201MB). However the existing build has several issues:
- **Stale frontend**: `frontend-build/` contains an old May build, not the latest July code
- **Bloated backend**: 152MB packaged including `chroma_db/` (48MB), `models/vosk-model-it/` (87MB), `data/` (17MB) — runtime data that should NOT be bundled
- **Old Electron**: v28.1.0 (current stable is v35)
- **No readiness check**: 3-second `setTimeout` before window creation, no backend health check
- **Unnecessary `canvas` dependency**: not needed, adds native build complexity
- **Missing files in packaged backend**: `start_server.py`, `test_env.py`, `test_ionos.py`, `test.txt` shouldn't be there

## Changes

### 1. Update `electron/package.json`
- Upgrade `electron` to `^35.0.0` (latest stable)
- Upgrade `electron-builder` to `^26.0.0`
- Remove `canvas` dependency
- Clean `extraResources`: only package `backend/app/`, `backend/requirements.txt`, `backend/models/` (for Vosk), exclude `chroma_db/`, `data/`, test files, `__pycache__/`
- Add `asar: true` (default but explicit)

### 2. Rewrite `electron/main.js`
- Replace `setTimeout(3000)` with actual health poll loop (`http://localhost:8000/health` every 500ms, max 30s)
- Add splash/loading window while waiting for backend
- Better Python detection: try `python3` from PATH first, then known locations
- Proper cleanup on quit (kill process tree, not just single PID)
- Handle case where Python/uvicorn not installed — show error dialog
- Use `file://` protocol for production (no need for custom HTTP server in production)
- Keep `serve-build.js` for dev mode only

### 3. Rebuild frontend
- `cd frontend && npm run build`
- Copy build output to `frontend-build/` (the directory electron-builder packages)

### 4. Build DMG
- `cd electron && npm install && npm run build:mac`
- Output: `electron/dist/LLM Wiki-1.0.0-arm64.dmg`

## Verification
1. Backend starts: `curl http://localhost:8000/health` returns `{"status":"healthy"}`
2. Frontend build: `frontend/build/index.html` exists with latest JS bundle
3. DMG created: `electron/dist/LLM Wiki-*.dmg` exists
4. Packaged app size: should be ~50MB (down from 201MB) after excluding runtime data
