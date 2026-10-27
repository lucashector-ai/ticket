#!/usr/bin/env bash
# Aplica o schema do Drizzle no banco de produção (branch main do Neon), lendo DATABASE_URL_PROD de .env.local.
# Usado depois de testar a mesma mudança no banco de desenvolvimento (pnpm db:push).
set -euo pipefail
cd "$(dirname "$0")/.."
url=$(grep -E '^DATABASE_URL_PROD=' .env.local | head -1 | cut -d= -f2- | tr -d '"')
[ -n "$url" ] || { echo "DATABASE_URL_PROD não está em .env.local" >&2; exit 1; }
DRIZZLE_DATABASE_URL="$url" pnpm exec drizzle-kit push --force 2>&1 | grep -v -i "postgres\(ql\)\?://"
