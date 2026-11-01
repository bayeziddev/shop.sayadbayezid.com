# Cwb Agency — shop.sayadbayezid.com

A Bangla-only marketplace that sells website packages and custom web-development services. Visitors see live demos, configure a package with transparent pricing, pay, and follow their project through to delivery.

Built on **Cloudflare Workers (Hono + TypeScript), D1, KV and R2**, deployed by GitHub Actions.

- **Full specification:** [`docs/SPEC.md`](docs/SPEC.md) — architecture, data models, payments, tracking rules, security, and the assumptions to confirm
- **Operations runbook:** [`docs/RUNBOOK.md`](docs/RUNBOOK.md)
- Original pixel / GA4 / GTM notes: `docs/reference/`

## Live URLs

| | URL |
|---|---|
| **Storefront** (GitHub Pages, DNS at Hostinger) | `https://shop.sayadbayezid.com`. Set the variable `PAGES_DOMAIN`, see [DEPLOY §6](docs/DEPLOY.md). |
| **Backend + full site** (Cloudflare Worker: API, payments, client portal) | `https://cwb-agency.<your-workers-subdomain>.workers.dev`. Printed in every **Deploy to Cloudflare Workers** run summary. |
| Admin panel | `<backend>/admin/` |
| Optional Cloudflare custom domain | `https://connectwithbayezid.it.com`. Set the variable `CUSTOM_DOMAIN`, see [DEPLOY §5](docs/DEPLOY.md). |

**First deploy:** follow [`docs/DEPLOY.md`](docs/DEPLOY.md). Add the GitHub secrets, then push to `main`. The workflow creates the Worker, database, KV and R2 automatically. At the free-plan database limit it reuses an empty database.

## Quick start (local)

```bash
npm ci
cp .dev.vars.example worker/.dev.vars   # fill in local values
npm run dev                             # http://localhost:8787 — admin at /admin/
```

## Checks

```bash
npm run typecheck
npm test            # unit + Workers-runtime integration tests
npm run test:e2e    # Playwright: configure → pay → requirements
```

## Deploy

See [`docs/DEPLOY.md`](docs/DEPLOY.md). Every push to `main` runs tests, then creates or finds the Cloudflare resources, takes a D1 backup, applies migrations, deploys, syncs secrets and health-checks the live URL.
