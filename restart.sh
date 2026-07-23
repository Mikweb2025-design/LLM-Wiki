#!/bin/bash
# LLM Wiki — smart restart
# Killa orfani su :8000/:3456, verifica Ollama, riapre l'app installata,
# attende che backend + frontend rispondano, stampa stato finale.

set -u

GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[0;33m"
BLUE="\033[0;34m"
DIM="\033[2m"
RESET="\033[0m"

APP_PATH="/Applications/LLM Wiki.app"
BACKEND_URL="http://127.0.0.1:8000"
FRONTEND_URL="http://127.0.0.1:3456"
OLLAMA_URL="http://127.0.0.1:11434"
WAIT_MAX=30   # secondi max attesa per il backend

log() { printf "${BLUE}▸${RESET} %s\n" "$1"; }
ok()  { printf "${GREEN}✓${RESET} %s\n" "$1"; }
warn(){ printf "${YELLOW}!${RESET} %s\n" "$1"; }
err() { printf "${RED}✗${RESET} %s\n" "$1"; }

# --- 1. Kill processi orfani -----------------------------------------------
log "Killing orphan backends..."
PIDS_8000=$(lsof -nP -iTCP:8000 -sTCP:LISTEN -t 2>/dev/null || true)
PIDS_3456=$(lsof -nP -iTCP:3456 -sTCP:LISTEN -t 2>/dev/null || true)
for pid in $PIDS_8000 $PIDS_3456; do
  kill "$pid" 2>/dev/null && echo "    killed PID $pid"
done
pkill -f "uvicorn app.main:app" 2>/dev/null || true
sleep 1
# se restano in vita: SIGKILL
for pid in $(lsof -nP -iTCP:8000 -sTCP:LISTEN -t 2>/dev/null); do
  kill -9 "$pid" 2>/dev/null && echo "    SIGKILL PID $pid"
done

log "Closing existing LLM Wiki window..."
osascript -e 'tell application "LLM Wiki" to quit' >/dev/null 2>&1 || true
sleep 1
pkill -f "LLM Wiki Helper" 2>/dev/null || true
pkill -x "LLM Wiki" 2>/dev/null || true

# --- 2. Verifica/Avvia Ollama ----------------------------------------------
log "Checking Ollama..."
if ! curl -sf -m 2 "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
  warn "Ollama non risponde, provo a lanciarlo..."
  if command -v ollama >/dev/null 2>&1; then
    (ollama serve >/tmp/ollama_serve.log 2>&1 &) || true
    for _ in 1 2 3 4 5; do
      sleep 1
      curl -sf -m 2 "$OLLAMA_URL/api/tags" >/dev/null 2>&1 && break
    done
  fi
fi
if curl -sf -m 2 "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
  ok "Ollama online"
else
  err "Ollama non raggiungibile — la chat userà solo IONOS (se configurato)"
fi

# --- 3. Avvia LLM Wiki ------------------------------------------------------
if [ ! -d "$APP_PATH" ]; then
  err "App non trovata in $APP_PATH"
  exit 1
fi
log "Launching LLM Wiki..."
open -a "$APP_PATH"

# --- 4. Attesa backend ------------------------------------------------------
log "Waiting backend (max ${WAIT_MAX}s)..."
elapsed=0
while [ $elapsed -lt $WAIT_MAX ]; do
  if curl -sf -m 2 "$BACKEND_URL/health" >/dev/null 2>&1; then
    ok "Backend $BACKEND_URL"
    break
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done
if [ $elapsed -ge $WAIT_MAX ]; then
  err "Backend non risponde dopo ${WAIT_MAX}s"
  exit 1
fi

# --- 5. Verifica frontend ---------------------------------------------------
if curl -sf -m 2 "$FRONTEND_URL/" >/dev/null 2>&1; then
  ok "Frontend $FRONTEND_URL"
else
  warn "Frontend server non risponde su 3456"
fi

# --- 6. Stato dettagliato ---------------------------------------------------
echo ""
log "Status snapshot:"
if curl -sf -m 5 "$BACKEND_URL/health/full" 2>/dev/null | python3 -m json.tool 2>/dev/null; then
  :
else
  curl -s -m 5 "$BACKEND_URL/health/full" 2>/dev/null
fi
echo ""
ok "Tutto in piedi."
echo "${DIM}Tip: 'curl $BACKEND_URL/metrics' per uptime + request count${RESET}"
