#!/usr/bin/env bash
# Fresh, isolated local stack for E2E: separate persistence dir, test secrets, bank transfer enabled.
set -euo pipefail
STATE=.wrangler/e2e-state
rm -rf "$STATE"
npm run build >/dev/null
npx wrangler d1 migrations apply DB --local --persist-to "$STATE" --config worker/wrangler.local.toml >/dev/null
npx wrangler d1 execute DB --local --persist-to "$STATE" --config worker/wrangler.local.toml \
  --command "UPDATE settings SET value='\"পরীক্ষা ব্যাংক — হিসাব ১২৩৪৫\"' WHERE key='bank_details'" >/dev/null
KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
exec npx wrangler dev --config worker/wrangler.local.toml --port 8788 --persist-to "$STATE" \
  --var ADMIN_SETUP_TOKEN:e2e-setup-token --var SESSION_SECRET:e2e-session-secret-123456 --var DATA_ENCRYPTION_KEY:"$KEY"
