#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${HOME}/duospend"
DATA_DIR="${DEPLOY_DIR}/data"

echo "==> Preparazione directory di deploy isolata in ${DEPLOY_DIR} (disco di sistema)..."
mkdir -p "${DATA_DIR}"
chown -R 1000:1000 "${DATA_DIR}"

cd "${DEPLOY_DIR}"

if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    chmod 600 .env
    echo "ATTENZIONE: creato file ${DEPLOY_DIR}/.env da .env.example."
    echo "Compila almeno VITE_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GEMINI_API_KEY, poi rilancia ./deploy.sh."
    exit 1
  else
    echo "ERRORE: file .env mancante in ${DEPLOY_DIR}."
    exit 1
  fi
fi

chmod 600 .env

echo "==> Build e avvio isolato del container duospend_app..."
docker compose up -d --build

echo "==> Verifica container attivo:"
docker ps --filter "name=duospend_app"

echo "==> Attesa healthcheck su http://127.0.0.1:3000/api/health..."
for i in {1..15}; do
  if curl -fsS http://127.0.0.1:3000/api/health; then
    echo ""
    echo "DuoSpend operativo su 127.0.0.1:3000 (accessibile via Cloudflare Tunnel o Tailscale)."
    exit 0
  fi
  sleep 2
done

echo "ATTENZIONE: /api/health non ha ancora risposto; controlla i log con: docker logs duospend_app"
exit 1
