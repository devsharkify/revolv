# Revolv Deploy Guide — for Imran

**What this is:** A 4-file folder that becomes a live website at revolv.ae (or .com) in about 45 minutes.

**What the dealer sees:** Portal page → click Start → unified 5-stage tool → complete car listing with AI-written copy in English/Hindi/Arabic, 360° viewer, damage map, enhanced photos.

**What runs where:**
- `index.html` + `revolv-studio.html` → static pages, served by Vercel's CDN
- `api/claude.js` → serverless function on Vercel, calls Anthropic API with server-side key
- Photoroom API → called directly from browser using dealer's own key (not ours)

**Cost before paying customers:** ~$0/month. Cost at 100 dealers × 50 listings/month = ~$175/month Anthropic + $0 Vercel. Dealer subscriptions ($79/month × 100) cover this many times over.

---

## File checklist

```
revolv-deploy/
├── index.html              ← Portal (loads at revolv.ae/)
├── revolv-studio.html      ← The tool (loads at revolv.ae/revolv-studio.html)
├── api/
│   └── claude.js           ← Server-side proxy (Vercel auto-maps to /api/claude)
└── vercel.json             ← Tells Vercel this is a serverless project
```

---

## Step 1 — Anthropic API key (5 min, ~$20)

1. Go to https://console.anthropic.com/
2. Sign up / log in
3. Settings → Billing → add $20 credit (covers 500+ listings of testing)
4. Settings → API Keys → Create Key (name it "revolv-prod")
5. Copy the key (starts with `sk-ant-api03-...`)

**Do not commit this key to git. Do not paste into any HTML file. Do not share with dealers.**

---

## Step 2 — Deploy (10 min)

```bash
# Install Vercel CLI globally (one-time)
npm install -g vercel

# Navigate to the folder
cd path/to/revolv-deploy

# Deploy
vercel
```

Prompts:
- Set up and deploy? **Y**
- Scope: pick your personal account
- Link to existing project? **N**
- Project name: `revolv`
- Directory: just press Enter
- Override settings? **N**

You'll get a URL like `https://revolv-xxxxx.vercel.app`. Open it in a browser — the portal should load. But clicking "Start now" → "Continue to details" → "Generate listing" will fail with a 500 error because the API key isn't set yet. That's Step 3.

---

## Step 3 — Set the API key on Vercel (2 min)

```bash
vercel env add ANTHROPIC_API_KEY
```

When prompted:
- Paste the key from Step 1
- Select all 3 environments (Production, Preview, Development) — hit space to toggle each, Enter to confirm

Then redeploy so the new env var takes effect:
```bash
vercel --prod
```

---

## Step 4 — Test end-to-end (5 min)

Open the production URL. On the portal page:

1. Click **Start now**
2. Upload 8-16 car photos
3. **Skip enhancement** — we'll test Photoroom separately later
4. 360° viewer should appear. Drag to rotate. Verify the disc is visible, Exterior/Gallery tabs work, hotspots toggle works.
5. Click **Continue to flaw check**
6. **This is the first real proxy test.** Claude Vision should scan the first photo and drop 0-5 hotspots. If it fails:
   - Vercel dashboard → Deployments → latest → Function Logs
   - Look for `/api/claude` errors
   - Most common: env var not set (Step 3) or not redeployed
7. Accept/edit the flaws, click Continue
8. Keep the pre-filled car details or change them, click **Generate listing in 3 languages**
9. **Second proxy test.** Should see listings in English, Hindi, Arabic appear in ~15-25 seconds.

**If step 6 and step 9 both work, deployment is verified.**

---

## Step 5 — Hook up the domain (10 min)

1. Buy `revolv.ae` or `revolv.com` on Namecheap / Porkbun / GoDaddy
2. Vercel dashboard → project → Settings → Domains
3. Add domain → Vercel shows DNS records (usually one A record + one CNAME)
4. Paste those records at your registrar
5. Wait 5-10 min for DNS
6. Domain is live

---

## Step 6 — Lock CORS to your domain (5 min, before showing dealers)

Right now `api/claude.js` allows requests from any origin. Fine for testing, risky in production. Open `api/claude.js`, find:

```js
const allowed = origin || '*';
```

Replace with:
```js
const allowedOrigins = [
  'https://revolv.ae',
  'https://www.revolv.ae',
  'https://revolv-xxxxx.vercel.app'  // keep Vercel URL if you want to keep testing there
];
const allowed = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
```

Redeploy:
```bash
vercel --prod
```

Now only requests from your actual website can hit the proxy. Scrapers can't drain your API budget.

---

## How the system actually works

```
┌────────────────────────────────────────────────────────┐
│ Dealer opens revolv.ae                                  │
│   ↓                                                     │
│ Portal (index.html) loads                               │
│   ↓  clicks "Start now"                                 │
│ Studio (revolv-studio.html) loads                       │
│   ↓  5 stages:                                          │
│                                                         │
│  [Stage 1] Upload photos                                │
│     → no API call                                       │
│                                                         │
│  [Stage 2] Photoroom enhancement                        │
│     → browser calls sdk.photoroom.com directly          │
│     → uses dealer's own Photoroom key (from localStorage)│
│     → 50 free/month per dealer, then $0.02/photo        │
│                                                         │
│  [Stage 3] 360° viewer                                  │
│     → pure JavaScript, no API call                      │
│                                                         │
│  [Stage 4] Claude Vision flaw detection                 │
│     → browser calls /api/claude (your proxy)            │
│     → proxy calls Anthropic with server-side key        │
│     → one API call per car, ~$0.01                      │
│                                                         │
│  [Stage 5] AI listing generation (EN/HI/AR)             │
│     → browser calls /api/claude 3 times in parallel     │
│     → ~$0.024 per listing total                         │
└────────────────────────────────────────────────────────┘
```

**Why is the Photoroom key in the browser but Claude key on the server?**
Photoroom allows browser-side keys (their architecture expects it). Anthropic doesn't (CORS blocks direct browser calls). Different vendors, different rules.

**Why give Photoroom key to dealer instead of using Revolv's?**
Because Photoroom costs real money per photo. If we paid, a dealer processing 1000 cars/month would cost us $20 just in Photoroom fees. If they pay, we keep margin. Dealers are happy because Photoroom's free tier covers low-volume dealers entirely.

---

## Common failures and fixes

**"Failed to fetch" in Stage 4 or 5 after deployment**
→ Check Vercel dashboard → project → latest deployment → Function Logs
→ Most common: `ANTHROPIC_API_KEY` env var not set. Re-run Step 3.

**"API 401" in function logs**
→ Invalid or expired Anthropic key. Regenerate and `vercel env add` again.

**"API 529" (Anthropic overloaded)**
→ Rare, Anthropic outage. Proxy passes through error. Just retry.

**Photoroom Stage 2 fails for a dealer**
→ Not your problem — their own key. Direct them to photoroom.com/api dashboard.

**CORS error after Step 6 hardening**
→ Dealer hit a URL not in `allowedOrigins` list. Add it and redeploy.

**Rate limit hit (30 req/min per IP)**
→ Built-in in `api/claude.js`. To raise it, change `RATE_LIMIT_MAX`. To persist across cold starts, upgrade to Upstash Redis.

---

## What this v1 deploy does NOT include (deliberate scope cuts)

- ❌ User accounts / login → dealers just use the URL
- ❌ Usage tracking → we'll see usage in Anthropic console
- ❌ Persistent listings → dealers download the HTML file
- ❌ Stripe billing → not needed until we have 10+ engaged dealers
- ❌ Multi-user dealer dashboard → not needed at pilot scale
- ❌ Analytics → add Plausible/PostHog after traction (15 min of work)
- ❌ Custom branding per dealer → v2 feature

Every one of these is 1-2 days of work and they'll add up. **Ship the pilot first. Add these only when a paying dealer requests them.**

---

## Rohan's parallel work (while Imran deploys)

1. Buy `revolv.ae` (Dubai-aligned) or `revolv.com` (global)
2. Create a WhatsApp Business account with a Dubai number
3. Update the hardcoded WhatsApp number in `index.html` and `revolv-studio.html`:
   ```bash
   # Find current placeholder:
   grep "971501234567" *.html
   # Replace with real number (e.g., 971501122334)
   sed -i '' 's/971501234567/971501122334/g' *.html
   ```
4. Draft cold outreach messages to 10 Dubai dealers (see `02_DUBAI_OUTREACH_PLAYBOOK.md`)

---

## The 1-week post-launch loop

After Vercel is live and 3 dealers are using it:

**Day 1:**
- Watch Vercel function logs in real-time
- Note which stage dealers get stuck on (probably Stage 1 — won't shoot 32 photos first try)

**Day 3:**
- Check Anthropic console for actual spend (calibrate pricing)
- Collect feedback from dealers — what's confusing? what do they love?

**Day 7:**
- Ship one iteration based on feedback
- Decide: is there signal to push harder, or pivot?

---

## Questions for Imran before starting

- [ ] Vercel account: existing, or new?
- [ ] Anthropic account: Rohan's existing, or Revolv-specific new one?
- [ ] Domain preference: revolv.ae (Dubai-focused), revolv.com (global), or both?

Answer, start Step 1, ping Claude with any errors.
