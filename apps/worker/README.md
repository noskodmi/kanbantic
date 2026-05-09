# @kanbantic/worker

Cloudflare Worker hosting Kanbantic's API: chain indexer, MCP JSON-RPC server,
Swarm proxy, Apify webhook receiver, Orbitport poller.

Phase 0 ships only `/hello` to verify the Wrangler toolchain is wired.
Phase 2 lands the indexer + read API. Phase 5 adds the auto-claim engine.
Phase 7 adds the Orbitport cron + Apify webhook + CCIP-Read resolver.

## Commands

- `pnpm dev` — local Wrangler dev server
- `pnpm test` — Vitest with `@cloudflare/vitest-pool-workers`
- `pnpm build` — Wrangler dry-run build
- `pnpm deploy` — push to production (requires `wrangler login`)
