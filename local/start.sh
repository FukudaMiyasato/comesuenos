#!/bin/sh
# Arranca todo en esta Mac: modelos locales, la web y la escucha por micrófono.
# Uso: npm run local        (Ctrl+C lo detiene todo)
cd "$(dirname "$0")/.."
MODEL=local/models/ggml-large-v3-turbo.bin
LLM=${CLASSIFY_MODEL:-qwen2.5:3b}

command -v ollama >/dev/null && command -v whisper-server >/dev/null && command -v ffmpeg >/dev/null || {
  echo "Falta instalar: brew install ollama whisper-cpp ffmpeg"; exit 1; }
[ -f "$MODEL" ] || { echo "Falta $MODEL (ver README, sección «Todo en la Mac»)"; exit 1; }

PIDS=""
trap 'kill $PIDS 2>/dev/null; exit 0' INT TERM EXIT

if ! curl -s -o /dev/null http://127.0.0.1:11434; then
  ollama serve >/dev/null 2>&1 & PIDS="$PIDS $!"
  sleep 2
fi
ollama pull "$LLM" >/dev/null 2>&1

whisper-server -m "$MODEL" -l es --host 127.0.0.1 --port 8178 \
  --inference-path /v1/audio/transcriptions >/dev/null 2>&1 & PIDS="$PIDS $!"

LOCAL_AI=1 CLASSIFY_MODEL="$LLM" node_modules/.bin/next dev -p 3000 >/dev/null 2>&1 & PIDS="$PIDS $!"

echo "Cargando modelos…"
until curl -s -o /dev/null http://127.0.0.1:8178 && curl -s -o /dev/null http://127.0.0.1:3000/api/state; do sleep 1; done
echo "Web: http://localhost:3000   ·   Admin: http://localhost:3000/admin"

# En segundo plano y con wait, para que Ctrl+C (o kill) lo detenga todo al instante.
node local/listen.mjs "$@" & PIDS="$PIDS $!"
wait $!
