# Operations Runbook — Cwb Agency

Commands below use `worker/wrangler.deploy.toml`. Generate it first with `CLOUDFLARE_API_TOKEN=… npm run cf:setup` (see `docs/DEPLOY.md`).

## Incident response (NIST CSF: Respond)

| Situation | Immediate actions |
|---|---|
| Admin account compromised | 1. Admin › Staff: deactivate the account. This revokes its sessions on the next request.<br>2. Rotate `SESSION_SECRET` (`npx wrangler secret put SESSION_SECRET --config worker/wrangler.deploy.toml`). This also invalidates **all** client portal links; affected clients get fresh links via `/account`.<br>3. Review Admin › Activity Log for the period. |
| `DATA_ENCRYPTION_KEY` suspected leaked | 1. Export affected requirements while the old key still works.<br>2. Set a new key.<br>3. Re-encrypt by re-saving (see `key_version` column).<br>4. Treat the incident as a personal-data breach and notify the clients involved. |
| Payment gateway credential leak | Rotate the SSLCommerz store password in its merchant panel, then run `wrangler secret put SSLCOMMERZ_STORE_PASSWORD`. Set System Settings › Payment › SSLCommerz to off until resolved; bank transfer still works. |
| Fake / disputed payment | Do **not** verify manually. Check the gateway panel. If an order was confirmed wrongly, mark it refunded or cancelled and record the reason in internal notes. |
| Meta token leak | Revoke it in Events Manager, then update the GitHub secret `META_CONVERSATION_API`. The next deploy syncs it. |
| Site down / bad deploy | `npx wrangler rollback --config worker/wrangler.deploy.toml` (previous version). If a migration caused it, restore D1 (below). |

After every incident: write a short note (what happened, impact, fix, prevention) and update this runbook.

## Backups & restore (NIST CSF: Recover)

**Automatic backups.** Every production deploy runs `wrangler d1 export` before migrating and stores the SQL dump as a GitHub Actions artifact for 30 days.

**Manual backup:**

```bash
npx wrangler d1 export DB --remote --config worker/wrangler.deploy.toml --output backup-$(date +%F).sql
```

**Point-in-time restore** (D1 Time Travel, last 30 days):

```bash
npx wrangler d1 time-travel info DB --config worker/wrangler.deploy.toml
npx wrangler d1 time-travel restore DB --timestamp 2026-10-31T10:00:00Z --config worker/wrangler.deploy.toml
```

**Restore from a dump into a fresh database:**

```bash
npx wrangler d1 create cwb-agency-db-restore
npx wrangler d1 execute cwb-agency-db-restore --remote --file backup.sql
```

Check the data, then deploy with `WORKER_NAME` unchanged and the restored database renamed. Alternatively, restore production in place with Time Travel (above), which is the simpler path.

**R2** (client files, screenshots, invoices) is not part of the D1 dump. Enable R2 bucket versioning or a scheduled copy to a second bucket.

**Quarterly drill:** restore the latest dump into a staging database and run `npm run test:e2e` against staging.
