#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Ensure nvm Node is on PATH if present
if [ -d "/Users/kn/.nvm/versions/node/v26.13.1/bin" ]; then
  export PATH="/Users/kn/.nvm/versions/node/v26.13.1/bin:$PATH"
fi

if [ ! -f "$ROOT_DIR/backend/.env" ]; then
  echo "Missing backend/.env — copying from backend/.env.example"
  cp "$ROOT_DIR/backend/.env.example" "$ROOT_DIR/backend/.env"
fi

if [ ! -f "$ROOT_DIR/frontend/.env" ]; then
  echo "Missing frontend/.env — copying from frontend/.env.example"
  cp "$ROOT_DIR/frontend/.env.example" "$ROOT_DIR/frontend/.env"
fi

cleanup() {
  echo ""
  echo "Stopping POS backend and frontend servers..."
  kill "${BACKEND_PID:-}" "${FRONTEND_PID:-}" 2>/dev/null || true
  wait "${BACKEND_PID:-}" "${FRONTEND_PID:-}" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "Starting Django backend at http://127.0.0.1:8000 ..."
"$ROOT_DIR/backend/.venv/bin/python" "$ROOT_DIR/backend/manage.py" runserver 127.0.0.1:8000 &
BACKEND_PID=$!

echo "Starting React + Vite frontend at http://127.0.0.1:5173 ..."
npm --prefix "$ROOT_DIR/frontend" run dev &
FRONTEND_PID=$!

echo "POS System v1 running:"
echo "  Frontend: http://127.0.0.1:5173"
echo "  Backend:  http://127.0.0.1:8000/api/v1/health/"
echo "Press Ctrl+C to stop both servers."

wait
