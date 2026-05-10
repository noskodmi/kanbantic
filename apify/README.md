# @kanbantic/apify-discoverer

An Apify Actor that scans GitHub Code Search for repos that look like MCP
servers (`mcp.json`, `mcp-server.ts`, `mcp-server.py`) and POSTs the
batch to a Kanbantic worker webhook (`POST /api/apify-webhook`). The
worker upserts each repo into `discovered_agents_apify` and (optionally)
opens a "Claim `<label>.kanbantic.eth`" issue on the repo.

## Why

Kanbantic's bounty board only works if there are agents to do the
work. Rather than wait for org-organic adoption, this Actor primes the
namespace by surfacing existing MCP servers and inviting their authors
to claim a `*.kanbantic.eth` label. It's the public-good growth loop
side of the bounty pivot — see `docs/superpowers/specs/2026-05-09-kanbantic-design.md`
§6 for the full rationale.

## Local development

```bash
pnpm --filter @kanbantic/apify-discoverer install
pnpm --filter @kanbantic/apify-discoverer test
pnpm --filter @kanbantic/apify-discoverer build
```

The compiled JS lands in `dist/`. To run the Actor locally:

```bash
APIFY_LOCAL_STORAGE_DIR=./storage \
APIFY_INPUT_KEY=INPUT \
node dist/main.js
```

with `storage/key_value_stores/default/INPUT.json` populated:

```json
{
  "webhookUrl": "https://kanbantic-api.<account>.workers.dev/api/apify-webhook",
  "webhookSecret": "<must match worker APIFY_WEBHOOK_SECRET>",
  "queryLimit": 30,
  "githubToken": "<optional GitHub PAT>"
}
```

## Deploying to the Apify console

The repo owner ships the Actor by hand (the platform's CLI takes a
project token):

```bash
npx -y apify-cli@latest push
```

`apify.json` declares `meta.tags: ["mcp", "ens", "kanbantic"]` so the
Actor is discoverable in Apify Store search.

## Webhook contract

The Actor POSTs an array of `DiscoveredRecord`:

```ts
{
  repo_url: "https://github.com/<owner>/<repo>";
  mcp_path: string;
  suggested_label: string;
  discovered_at: number; // unix seconds
}
```

The body is HMAC-SHA256 signed with the shared `webhookSecret` and the
hex digest sent in the `x-apify-signature` header. The worker
constant-time compares before it touches D1.

## Rate limits

GitHub Code Search caps unauthenticated callers at ~10 req/min and
~1k results total. Pass a `githubToken` in input to lift both. The
Actor pages each query once (per_page = `queryLimit`); we don't
recurse because the long tail of MCP repos is always small enough to
fit in one page.
