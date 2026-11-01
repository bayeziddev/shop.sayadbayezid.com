# Deploy guide — Cwb Agency on Cloudflare Workers

**How the pieces fit together**

- **GitHub** stores the code. GitHub Actions tests it and deploys it.
- **Cloudflare Workers** is the backend: the Hono API (`/api/*`), payments, the admin panel, the client portal and invoices. It also serves the full website on its own `workers.dev` link.
- **GitHub Pages** *(optional)* serves a static copy of the public pages on **`shop.sayadbayezid.com`**, so the DNS can stay at Hostinger. Prices, orders, leads and chat on those pages go to the Worker's API. See §6.
- **Cloudflare D1 / KV / R2** hold the database, sessions and uploaded files.
- The deploy workflow **creates all of these for you**. You never paste database IDs.

| Step | Where | Time |
|---|---|---|
| 1. Cloudflare account + workers.dev name | Cloudflare | 2 min |
| 2. API token | Cloudflare | 3 min |
| 3. GitHub secrets | GitHub | 5 min |
| 4. First deploy → **live on workers.dev** | GitHub Actions | ~6 min |
| 5. **Custom domain `connectwithbayezid.it.com`** (already on Cloudflare — recommended) | GitHub variable | 2 min |
| 6. **`shop.sayadbayezid.com` on GitHub Pages** (DNS stays at Hostinger) | Hostinger + GitHub | 10 min + DNS wait |

> **Use ONE Cloudflare account for everything.** The API token, the `CLOUDFLARE_ACCOUNT_ID` and the domain `connectwithbayezid.it.com` must all belong to the **same** Cloudflare account. The deploy log prints `Cloudflare account: <name>` so you can check.

---

## 1. Cloudflare account

1. Sign up at <https://dash.cloudflare.com/sign-up>. The Free plan is enough.
2. Open **Workers & Pages** once. Cloudflare asks you to choose your free **workers.dev subdomain**, for example `cwbagency`.
   - Your site will then live at `https://cwb-agency.cwbagency.workers.dev`.
   - If you skip this, set the GitHub variable `WORKERS_DEV_SUBDOMAIN` instead (step 3) and the workflow registers it.
3. *(Optional, for image and file uploads)* go to **R2 Object Storage → Get started / Enable R2**.
   - The free tier is 10 GB, but Cloudflare may ask for a card.
   - Without R2 the site still works; only uploads (screenshots, client files) are disabled until you enable it and re-run the deploy.

## 2. Create the API token

**My Profile → API Tokens → Create Token → template “Edit Cloudflare Workers” → Use template**

1. Under **Permissions**, click **+ Add more** and add **Account → D1 → Edit**.
2. **Account Resources:** choose your account.
3. **Zone Resources:** **All zones**. This is needed later for the custom domain.
4. **Continue → Create Token**, then copy the token. It is shown only once.

Your **Account ID** is on the right side of the *Workers & Pages* overview page, or in the dashboard URL (`dash.cloudflare.com/<ACCOUNT_ID>/…`).

## 3. GitHub secrets & variables

Go to **github.com/bayeziddev/shop.sayadbayezid.com → Settings → Secrets and variables → Actions**.

**Secrets** tab (*New repository secret*):

| Name | Value | Needed? |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 2 | **required** |
| `CLOUDFLARE_ACCOUNT_ID` | your account id | recommended |
| `ADMIN_SETUP_TOKEN` | any long password you invent; it is used once to create the first admin | **required** |
| `SESSION_SECRET` | output of `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | recommended* |
| `DATA_ENCRYPTION_KEY` | output of `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` | recommended* — **keep a copy safe** |
| `META_CONVERSATION_API` | already added — the Meta Conversions API token | ✓ |
| `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD` | from SSLCommerz (sandbox first) | to accept bKash, Nagad and card payments |
| `GEMINI_API_KEY` | Google AI Studio key | for ✨ AI descriptions |

\* If you don't set these two, the first deploy generates them on the Worker once and never changes them. Because Cloudflare secrets can't be read back, set your own **before real client data arrives** so you hold a copy.

**Variables** tab (all optional):

| Name | Example | Effect |
|---|---|---|
| `WORKER_NAME` | `cwb-agency` (default) | first part of the workers.dev URL |
| `WORKERS_DEV_SUBDOMAIN` | `cwbagency` | only if you skipped choosing one in step 1 |
| `PAYMENT_MODE` | `sandbox` (default) / `live` | keep `sandbox` until live SSLCommerz keys are set. In sandbox no Purchase event is ever sent. |
| `CUSTOM_DOMAIN` | `connectwithbayezid.it.com,www.connectwithbayezid.it.com` | one or more hostnames, comma-separated; the first is the main URL (see step 5) |
| `CUSTOM_DOMAIN_TAKEOVER` | `true` | move the hostname away from an old Worker that currently uses it |
| `D1_DATABASE_NAME` | `cwb-api` | use a specific existing **empty** database. Usually not needed: at the D1 limit the deploy automatically reuses an empty database, preferring one named like the app. |
| `PAGES_DOMAIN` | `shop.sayadbayezid.com` | publish the storefront on GitHub Pages at this domain (see §6) |
| `ENABLE_BROWSER_RENDERING` | `true` | real PDF invoices; otherwise a print-to-PDF page is used |

## 4. First deploy

1. Merge the branch into `main`. Every push to `main` deploys.
   - Or open **Actions → “Deploy to Cloudflare Workers” → Run workflow**. This button appears once the workflow file is on `main`.
2. The workflow runs, in order:
   1. tests
   2. create or find the Worker, D1 database, KV namespace and R2 bucket
   3. back up the database
   4. apply migrations
   5. deploy
   6. sync secrets
   7. health check
3. Open the finished run. The **Summary** shows the live links:

   | | URL |
   |---|---|
   | Website | `https://cwb-agency.<your-subdomain>.workers.dev` |
   | Admin panel | `https://cwb-agency.<your-subdomain>.workers.dev/admin/` |

   The same link appears on the repo home page under **Environments → production → View deployment**, and in Cloudflare under **Workers & Pages → cwb-agency**.
4. Open `/admin/`, enter your `ADMIN_SETUP_TOKEN`, and create the first admin account.
5. Follow the onboarding checklist on the dashboard: bank details, demo links, WhatsApp number.

---

## 5. Custom domain `connectwithbayezid.it.com` — recommended

This domain is **already on Cloudflare**, so you don't need to change any DNS. It also matches the brand: **C**onnect **w**ith **B**ayezid = **Cwb** Agency.

**Recommended setup:** the main site on the bare domain, with `www` redirecting to it automatically.

1. In Cloudflare, make sure the domain is **Active** and in the **same account** as your API token.
2. Under **DNS → Records**, delete any old `A`, `AAAA` or `CNAME` record for `connectwithbayezid.it.com` (`@`) and `www`. If the old Worker uses the domain, either remove it there (**Workers & Pages → old worker → Settings → Domains & Routes**), or set the variable `CUSTOM_DOMAIN_TAKEOVER = true` and the deploy moves it for you.
3. In GitHub, go to **Settings → Secrets and variables → Actions → Variables → New variable** and add `CUSTOM_DOMAIN` = `connectwithbayezid.it.com,www.connectwithbayezid.it.com`.
4. Go to **Actions → Deploy to Cloudflare Workers → Run workflow**. Cloudflare creates the DNS records and SSL certificates.
   - The site is live at `https://connectwithbayezid.it.com`, and `www.` redirects to it.
   - `https://cwb-agency.<subdomain>.workers.dev` keeps working as a backup.

If you already use the bare domain for something else, use a subdomain instead: `CUSTOM_DOMAIN` = `shop.connectwithbayezid.it.com`.

## 6. `shop.sayadbayezid.com` on GitHub Pages — DNS stays at Hostinger

**How it works:**
- **`https://shop.sayadbayezid.com` (GitHub Pages)** serves the public pages: home, categories, packages and the configurator, checkout, FAQ, policies, quiz, quote and landing pages. They are copied from the Worker after every deploy and **every hour**, so admin edits (prices, offers, banners) appear within the hour. You can also publish at once with **Actions → Publish storefront to GitHub Pages → Run workflow**.
- **The Cloudflare Worker** stays the backend. Every price, order, lead, chat and tracking call from those pages goes to the Worker's API; the Worker allows `shop.sayadbayezid.com` via CORS.
- **Pages that stay on the Worker's link:** payment return, the client's order page and project portal, invoices, uploaded images and **`/admin/`**.
- Prices are always re-checked by the Worker at checkout, so a copy that is up to an hour old can never charge a wrong amount.

### Steps
1. **Hostinger → hPanel → Domains → sayadbayezid.com → DNS / Nameservers → DNS records.** Add a record:
   - Type **CNAME**, Name **`shop`**, Target **`bayeziddev.github.io`**, TTL default.
   - First delete any other `shop` record (A, AAAA or CNAME).
2. **GitHub → repo → Settings → Pages:**
   - **Source: GitHub Actions**.
   - **Custom domain: `shop.sayadbayezid.com`** → Save. When the DNS check turns green (minutes up to a few hours), tick **Enforce HTTPS**.
3. **GitHub → Settings → Secrets and variables → Actions → Variables:**
   - add **`PAGES_DOMAIN`** = `shop.sayadbayezid.com`;
   - **delete `CUSTOM_DOMAIN`** if it is `shop.sayadbayezid.com` (a GitHub Pages domain can't also be a Worker domain; the deploy ignores it anyway).
4. **Actions → Deploy to Cloudflare Workers → Run workflow.** This updates the Worker for GitHub Pages, then **Publish storefront to GitHub Pages** runs automatically. Its summary shows:
   - Storefront: `https://shop.sayadbayezid.com`
   - Backend and admin: `https://cwb-agency.<subdomain>.workers.dev` (admin at `/admin/`)
5. In the SSLCommerz merchant panel and in Meta Events Manager, add both domains (`shop.sayadbayezid.com` and the `workers.dev` link). Visitors browse on the first; payment returns and the client portal are on the second.

### Alternative: move the DNS to Cloudflare instead
If you'd rather run everything, admin and portal included, on `shop.sayadbayezid.com`:
1. Move only the nameservers of `sayadbayezid.com` from Hostinger to Cloudflare. It's free, Hostinger stays your registrar, and Cloudflare imports all records. Check the MX and TXT records for Hostinger email, and turn off DNSSEC first.
2. Then set `CUSTOM_DOMAIN = shop.sayadbayezid.com` instead of `PAGES_DOMAIN`.

A CNAME from Hostinger straight to `workers.dev` does **not** work, and subdomain-only Cloudflare setups need a paid Business plan. That's why GitHub Pages is the simplest way while the DNS stays at Hostinger.

---

## Manual deploy from a laptop (optional)

```bash
export CLOUDFLARE_API_TOKEN=...   CLOUDFLARE_ACCOUNT_ID=...
npm ci
npm run deploy        # build → create/find resources → migrate → deploy
npx wrangler secret put ADMIN_SETUP_TOKEN --config worker/wrangler.deploy.toml
```

## Troubleshooting

| Message in the Actions log | Fix |
|---|---|
| `Deploy skipped — add the CLOUDFLARE_API_TOKEN` | Step 3 |
| `no workers.dev subdomain yet` | Open Workers & Pages once (step 1), or set `WORKERS_DEV_SUBDOMAIN` |
| `D1 list failed … D1: Edit` | Edit the API token and add **Account → D1 → Edit** |
| `uses the EMPTY database "…"` (warning) | Normal on accounts at the free 10-database limit: the deploy reuses an empty database and keeps using it. Nothing to do. |
| `maximum number of D1 databases` (error) | Only when **no** empty database exists. Delete an unused one (**Storage & databases → D1 → database → Settings → Delete**) and re-run. |
| `Custom domain skipped` (warning) | The Worker is deployed on workers.dev anyway. Fix the domain as the note says, or use `PAGES_DOMAIN` (§6). |
| Pages workflow: `not configured for GitHub Pages yet` | Run **Deploy to Cloudflare Workers** once after adding `PAGES_DOMAIN` |
| GitHub Pages shows “DNS check unsuccessful” | The Hostinger CNAME `shop → bayeziddev.github.io` is missing or still propagating (up to a few hours) |
| `… is not a domain in the Cloudflare account "…"` | The domain lives in a different Cloudflare account than the API token. Create the token in the account that has the domain (and update `CLOUDFLARE_ACCOUNT_ID`). |
| `… is currently attached to another Worker` | Remove it from the old Worker, or set `CUSTOM_DOMAIN_TAKEOVER = true` |
| `R2 is not enabled` (warning) | Dashboard → R2 → enable, then re-run. The site works meanwhile. |
| Custom-domain error during deploy | The domain is not *Active* on Cloudflare yet, or an old DNS record already exists for that hostname (step 5.2 / 6.3) |
| `/healthz did not return 200` | Open Cloudflare → Workers & Pages → cwb-agency → **Logs** |
