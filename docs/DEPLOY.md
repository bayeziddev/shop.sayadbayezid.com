# Deploy guide — Cwb Agency on Cloudflare Workers

**How the pieces fit together**

- **GitHub** stores the code. GitHub Actions tests it and deploys it.
- **Cloudflare Workers** runs everything: the Bangla website, the admin panel and the Hono API (`/api/*`), on one Worker.
- **Cloudflare D1 / KV / R2** hold the database, sessions and uploaded files.
- The deploy workflow **creates all of these for you**. You never paste database IDs.

| Step | Where | Time |
|---|---|---|
| 1. Cloudflare account + workers.dev name | Cloudflare | 2 min |
| 2. API token | Cloudflare | 3 min |
| 3. GitHub secrets | GitHub | 5 min |
| 4. First deploy → **live on workers.dev** | GitHub Actions | ~6 min |
| 5. **Custom domain `connectwithbayezid.it.com`** (already on Cloudflare — recommended) | GitHub variable | 2 min |
| 6. (optional) `shop.sayadbayezid.com` (DNS at Hostinger) | Hostinger + Cloudflare | 15 min + DNS wait |

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
| `D1_DATABASE_NAME` | `my-empty-db` | reuse an **empty** existing D1 database (only if the account hit its database limit) |
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

## 6. Using `shop.sayadbayezid.com` (domain registered at Hostinger) — optional

### What is and isn't possible

| Option | Works? | Why |
|---|---|---|
| At Hostinger, add a CNAME `shop → cwb-agency.xxx.workers.dev` | ❌ | `workers.dev` only answers for its own hostnames; you get SSL and 404 errors |
| Add only the subdomain `shop.sayadbayezid.com` to Cloudflare | ❌ on Free | Partial (CNAME) and subdomain setups need the Business or Enterprise plan |
| **Move only the DNS (nameservers) of `sayadbayezid.com` to Cloudflare** | ✅ **free — recommended** | A Worker custom domain needs the domain to be an *active Cloudflare zone*. The domain stays registered at Hostinger, and your main website and email keep running on Hostinger. |
| Keep using the `workers.dev` link | ✅ | Fully working, HTTPS included, until you are ready |

“Move DNS to Cloudflare” does **not** move the domain or your Hostinger website. Only the DNS “phone book” moves, and every existing record is copied over.

### Steps

1. **Cloudflare → Add a domain** → `sayadbayezid.com` → **Free** plan. Cloudflare scans and imports your DNS records.
2. **Compare the records** with Hostinger (**hPanel → Domains → sayadbayezid.com → DNS / Nameservers → DNS records**). Make sure Cloudflare has every one:
   - `A @` (your main site) and `www`
   - **MX** records (Hostinger email, e.g. `mx1.hostinger.com`, `mx2.hostinger.com`)
   - **TXT** SPF (`v=spf1 include:_spf.mail.hostinger.com …`) and the DKIM/DMARC records
   - any other subdomains you use

   For the records that point to Hostinger, choose **DNS only (grey cloud)** for the first switch. This avoids SSL surprises on the Hostinger site; you can turn the orange proxy on later.
3. **Delete any existing `shop` record** in Cloudflare DNS, for example an old CNAME to `bayeziddev.github.io` from GitHub Pages. A Worker custom domain can't be created over an existing CNAME. Also turn off GitHub Pages for this repo (**Settings → Pages**); the site no longer uses it.
4. **At Hostinger:**
   1. If **DNSSEC** is on (hPanel → Domains → DNSSEC), turn it off first.
   2. Go to **hPanel → Domains → sayadbayezid.com → DNS / Nameservers → Change nameservers → Use custom nameservers**.
   3. Enter the **two nameservers Cloudflare shows you** (like `xxx.ns.cloudflare.com`) and save.
5. Wait until Cloudflare shows **“Active”** for the domain. Usually minutes; at most 24 hours. Cloudflare emails you.
6. **GitHub → Settings → Variables:** set `CUSTOM_DOMAIN` = `shop.sayadbayezid.com` (or add it after the other domains, separated by commas). Then **Actions → Deploy to Cloudflare Workers → Run workflow**.
   - Cloudflare creates the DNS record and SSL certificate automatically.
   - Payment callbacks, emails and the canonical URL switch to `https://shop.sayadbayezid.com`.
   - The `workers.dev` link keeps working as a backup.
7. After switching to the custom domain, update the URLs in the SSLCommerz merchant panel and in the Meta Events Manager domain settings to `shop.sayadbayezid.com`.

### Why not “frontend on GitHub Pages + API on Cloudflare”?

You don't need that split. With step 5 done, one Worker serves both the Bangla website and the Hono API on `shop.sayadbayezid.com`, and GitHub still hosts the code and runs the deploys.

A split would make things worse:
- The pages are rendered on the server, which GitHub Pages can't do.
- Admin login cookies, payment-gateway return URLs, and the Pixel ↔ Conversions-API event matching would all have to work across two domains.

If moving DNS is impossible for some reason, keep using the `workers.dev` URL in your ads. It is a full, working, HTTPS site.

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
| `maximum number of D1 databases` / `7406: System limit reached: databases per account (10)` | The free plan allows 10 D1 databases and the account already has 10; the log lists them. **Either** delete unused ones (**Storage & databases → D1 → database → Settings → Delete**) and re-run, **or** set the variable `D1_DATABASE_NAME` to an existing database with *tables: 0* |
| `… is not a domain in the Cloudflare account "…"` | The domain lives in a different Cloudflare account than the API token. Create the token in the account that has the domain (and update `CLOUDFLARE_ACCOUNT_ID`). |
| `… is currently attached to another Worker` | Remove it from the old Worker, or set `CUSTOM_DOMAIN_TAKEOVER = true` |
| `R2 is not enabled` (warning) | Dashboard → R2 → enable, then re-run. The site works meanwhile. |
| Custom-domain error during deploy | The domain is not *Active* on Cloudflare yet, or an old DNS record already exists for that hostname (step 5.2 / 6.3) |
| `/healthz did not return 200` | Open Cloudflare → Workers & Pages → cwb-agency → **Logs** |
