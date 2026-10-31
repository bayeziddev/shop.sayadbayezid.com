# Cwb Agency — shop.sayadbayezid.com

A Bangla-only marketplace that sells website packages and custom web-development services. Visitors see live demos, configure a package with transparent pricing, pay, and follow their project through to delivery.

Built on **Cloudflare Workers (Hono + TypeScript), D1, KV and R2**, deployed by GitHub Actions.

- **Full specification:** [`docs/SPEC.md`](docs/SPEC.md) — architecture, data models, payments, tracking rules, security, and the assumptions to confirm
- **Operations runbook:** [`docs/RUNBOOK.md`](docs/RUNBOOK.md)
- Original pixel / GA4 / GTM notes: `docs/reference/`

## Quick start

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

See [SPEC §17](docs/SPEC.md#17-development-environment--deployment) for one-time Cloudflare setup. After that, every push to `main` runs tests, takes a D1 backup, applies migrations, syncs secrets and deploys.
