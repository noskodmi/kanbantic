# Post-merge runbook

Run this after merging `feat/submission-pack` (or any other docs +
ops branch) and **before** declaring the live URLs production-ready
for judges. Order matters — apply migrations *before* re-deploying the
worker, set secrets *before* re-deploying.

All commands assume `cwd = /Users/d/dev/foolingaround/kanbantic` and a
recent `pnpm install`.

## 1. Apply D1 migrations to remote

The worker's D1 binding is `kanbantic-indexer`. Migrations live at
`apps/worker/migrations/*.sql` and are applied lexicographically.

```bash
pnpm --filter @kanbantic/worker migrate:remote
```

This iterates every `*.sql` file and aborts on the first failure.
Re-running is safe — every migration is `CREATE … IF NOT EXISTS` or
otherwise idempotent.

**Verify** by hitting the live status endpoint and confirming
`lastBlock` is non-zero (the indexer needs a reachable
`index_cursor` row to report any block at all):

```bash
curl -s https://kanbantic-api.lizzflix.workers.dev/api/status | python3 -m json.tool
```

## 2. Set worker secrets

Cloudflare-side secrets are stored on the Worker, not in
`wrangler.toml`. Run each `wrangler secret put` from
`apps/worker/`. You'll be prompted for the value (paste, hit enter).

```bash
cd apps/worker

# SIWE HMAC secret - any 32-byte random hex
wrangler secret put SIWE_HMAC_SECRET

# Apify webhook signing secret (must match the Actor's webhook config)
wrangler secret put APIFY_WEBHOOK_SECRET

# GitHub App token for the MCP-discovery Actor's claim issues
wrangler secret put GITHUB_APP_TOKEN

# Real Orbitport pubkey (replaces any test-fixture value baked into wrangler.toml)
wrangler secret put ORBITPORT_PUBKEY
```

Secrets list (`wrangler secret list`) should include all four after.

## 3. Re-deploy worker

The workflow `.github/workflows/deploy.yml` deploys the worker
automatically on push to `main`. To force a manual re-deploy after
the secrets are set:

```bash
gh workflow run deploy.yml --ref main
# or, locally:
pnpm --filter @kanbantic/worker exec wrangler deploy --env=""
```

The local invocation requires `CLOUDFLARE_API_TOKEN` +
`CLOUDFLARE_ACCOUNT_ID` exported in the shell.

## 4. Re-deploy web

```bash
gh workflow run deploy.yml --ref main
# or, locally (requires VERCEL_TOKEN):
pnpm --filter @kanbantic/web build
npx vercel@latest deploy --prod --token "$VERCEL_TOKEN" --yes
```

Both jobs run in parallel inside `deploy.yml`, so a single workflow
dispatch covers both surfaces.

## 5. Verify the live surfaces

Tick each before handing the URL to judges:

- [ ] `https://kanbantic-api.lizzflix.workers.dev/api/status` → 200,
      `lastBlock` within 5 blocks of the public Sepolia head, all
      contract addresses non-zero.
- [ ] `https://kanbantic.vercel.app` → 200, no console errors,
      footer indexer-lag badge green.
- [ ] `https://kanbantic.vercel.app/agents` → registry grid renders
      with at least `noskodmi.kanbantic.eth` visible.
- [ ] `https://kanbantic.vercel.app/agents/noskodmi.kanbantic.eth` →
      profile loads, MCP try-panel returns a `tools/list` response.
- [ ] `https://kanbantic.vercel.app/work` → at least one open
      bounty visible (post one if empty — see recording checklist).
- [ ] `https://kanbantic.vercel.app/dashboard/contract-intelligence`
      → audit on the `BountyBoard` address completes ≤ 30s and
      renders a structured report with deep links to
      `sourcify.dev/lookup/<addr>`.
- [ ] `https://kanbantic.vercel.app/dashboard/agent` → Umia spin-out
      modal renders the generated CLI manifest for the deployer's
      agent.
- [ ] **Trigger** `nightly.yml` manually
      (`gh workflow run nightly.yml --ref main`) and confirm the run
      goes green.

If any of these are red, do **not** declare the deploy done; debug
first, then loop back to step 1.
