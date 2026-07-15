#!/bin/sh
set -eu

SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
INSTALL_DIR=${INFRA_INSTALL_DIR:-"$HOME/infra-dashboard"}
OWNER_EMAIL=${INFRA_OWNER_EMAIL:-owner@localhost}

command -v docker >/dev/null 2>&1 || { echo "Docker is required. Install Docker Engine, then run this installer again." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required." >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || { echo "openssl is required to generate installation secrets." >&2; exit 1; }

mkdir -p "$INSTALL_DIR"
tar -C "$SOURCE_DIR" --exclude='./node_modules' --exclude='./dist' --exclude='./.git' --exclude='./.env' -cf - . | tar -C "$INSTALL_DIR" -xf -

ENV_FILE="$INSTALL_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  JWT_SECRET=$(openssl rand -hex 32)
  POSTGRES_PASSWORD=$(openssl rand -hex 24)
  BOOTSTRAP_PASSWORD=$(openssl rand -base64 18 | tr -d '\n')
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
HOST=0.0.0.0
PORT=8787
CORS_ORIGIN=http://127.0.0.1:8080
DATABASE_URL=postgresql://infra:${POSTGRES_PASSWORD}@postgres:5432/infra_dashboard
JWT_SECRET=${JWT_SECRET}
COOKIE_SECURE=false
LOCAL_AUTH_BYPASS=false
HOST_ALERT_THRESHOLD=90
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
BOOTSTRAP_EMAIL=${OWNER_EMAIL}
BOOTSTRAP_PASSWORD=${BOOTSTRAP_PASSWORD}
WEB_PORT=8080
EOF
  printf '\nInfra Dashboard owner: %s\nInitial password: %s\nURL: http://127.0.0.1:8080\n\n' "$OWNER_EMAIL" "$BOOTSTRAP_PASSWORD"
fi

docker compose --env-file "$ENV_FILE" -f "$INSTALL_DIR/docker-compose.yml" up -d --build
echo "Infra Dashboard is running."
