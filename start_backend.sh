#!/bin/bash
export IONOS_API_KEY=$(cat /tmp/ionos_key.txt)
pkill -f "uvicorn app.main:app" 2>/dev/null
sleep 2
cd /Users/daniele/Downloads/Documents/opencode/LLMWiki/backend
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > /tmp/llmwiki_backend.log 2>&1 &
disown $!
sleep 4
curl -s http://localhost:8000/api/chat/models | python3 -m json.tool
