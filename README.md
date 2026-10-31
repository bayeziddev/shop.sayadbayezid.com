# Cwb Agency — shop.sayadbayezid.com

A Bangla-only marketplace that sells website packages and custom web-development services. Visitors see live demos, configure a package with transparent pricing, pay, and follow their project through to delivery.

Built on **Cloudflare Workers (Hono + TypeScript), D1, KV and R2**, deployed by GitHub Actions.

- **Full specification:** [`docs/SPEC.md`](docs/SPEC.md) — architecture, data models, payments, tracking rules, security, and the assumptions to confirm
- **Operations runbook:** [`docs/RUNBOOK.md`](docs/RUNBOOK.md)
- Original pixel / GA4 / GTM notes: `docs/reference/`

## Live URLs

| | URL |
|---|---|
| Website (Cloudflare Workers) | `https://cwb-agency.<your-workers-subdomain>.workers.dev`. The exact link is printed in every **Actions → Deploy to Cloudflare Workers** run summary and under **Environments → production**. |
| Admin panel | `<website>/admin/` |
| Custom domain (recommended, already on Cloudflare) | `https://connectwithbayezid.it.com`. Set the GitHub variable `CUSTOM_DOMAIN` (see [DEPLOY §5](docs/DEPLOY.md)). |
| Optional second domain | `https://shop.sayadbayezid.com` once its DNS moves from Hostinger to Cloudflare |

**First deploy:** follow [`docs/DEPLOY.md`](docs/DEPLOY.md). Add two GitHub secrets, then push to `main`. The workflow creates the Worker, D1, KV and R2 automatically.

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
