#!/usr/bin/env bash
# Envia os segredos do Worker "ticket" para o Cloudflare a partir de um arquivo .env.
# Uso: CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./scripts/cf-secrets.sh [.env.production]
set -euo pipefail
ENV_FILE="${1:-.env.production}"
[ -f "$ENV_FILE" ] || { echo "arquivo $ENV_FILE não encontrado"; exit 1; }
# Produção usa a branch main do Neon: DATABASE_URL_PROD vira DATABASE_URL no Worker.
{
  grep -E '^(NEON_AUTH_BASE_URL|NEON_AUTH_COOKIE_SECRET|NEON_AUTH_JWKS_URL)=' "$ENV_FILE"
  if grep -q '^DATABASE_URL_PROD=' "$ENV_FILE"; then
    echo "DATABASE_URL=$(grep '^DATABASE_URL_PROD=' "$ENV_FILE" | cut -d= -f2-)"
  else
    grep -E '^DATABASE_URL=' "$ENV_FILE"
  fi
} > /tmp/onde-secrets.json.tmp
python3 - <<'PY'
import json
d={}
for line in open('/tmp/onde-secrets.json.tmp'):
    k,v=line.rstrip('\n').split('=',1); d[k]=v
json.dump(d, open('/tmp/onde-secrets.json','w'))
PY
rm -f /tmp/onde-secrets.json.tmp
pnpm exec wrangler secret bulk /tmp/onde-secrets.json
rm -f /tmp/onde-secrets.json
echo "segredos enviados."
