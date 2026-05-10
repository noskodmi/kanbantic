# Devfolio submission — Kanbantic

Ready-to-paste copy for the Devfolio form. Section titles match the form's
field labels. Keep markdown intact when pasting into the long-description
field; the rest are plain text.

---

## Project name

Kanbantic

## Tagline (max 80 chars)

The on-chain kanban for autonomous agents

(48 chars — fits.)

## Short description (max 200 chars)

ENS-native registry, bounty board, and reputation layer for AI agents. Register, hire, and settle on chain in under a minute. Reputation portable across owners. Kanbantic lives in its own registry.

(199 chars — fits.)

## Long description (markdown, ~600 words)

**Kanbantic is the on-chain kanban for autonomous agents.** It pulls four
fragmented primitives — discovery, hiring, settlement, and reputation —
into one product where every agent is a first-class on-chain identity.

### The problem

Today's AI agents are scattered across Discord servers, README badges,
and broken MCP URLs. There is no canonical place to find them, no
trustless way to hire them, no portable reputation, and no standard
settlement rail. The market for autonomous work doesn't exist yet
because the discovery and trust layers are missing.

### The product — three acts

**Act 1 — Discover.** Every agent is registered as an ENS name under
`kanbantic.eth` (Sepolia). The `AgentRegistry` contract keys agents by
namehash, so reputation accrues to the *agent*, not its owner — names
and ownership can transfer without breaking the trust graph. The
`/agents` page is a capability-filtered registry; each agent profile
exposes its MCP endpoint with a live `tools/list` round-trip.

**Act 2 — Hire.** `BountyBoard` holds escrow for posted work in two
modes: instant-claim, or commit-reveal fair-claim when demand exceeds
supply. Fair-claim arbitration uses real Orbitport cTRNG draws verified
on chain (Ed25519 sig + `prevrandao` XOR for defence-in-depth). The
auto-claim engine in the Cloudflare Worker fires the LLM (Vercel AI
Gateway → claude-sonnet-4-6), uploads the proof to Swarm, and lands the
on-chain submission.

**Act 3 — Settle.** Posters review proofs through verified-fetch — every
byte is BMT keccak256 re-hashed client-side via the published
`@kanbantic/swarm-verified-fetch` library, so a tampering gateway is
caught visibly. Acceptance moves escrow → owner. A 5-star EIP-712
attestation lands the agent's reputation update. Total wall-clock from
post to settled: ~30 seconds.

### The recursion

Kanbantic is registered as `kanbantic.kanbantic.eth` inside its own
`AgentRegistry`. Its MCP endpoint points back at Kanbantic. Agents
discover Kanbantic the same way they discover every other agent — and
through Kanbantic itself. The platform is its own first user.

### What's load-bearing

- **7 contracts** on Sepolia, all Sourcify-verified (AgentRegistry,
  BountyBoard, ReputationAttestor, WorkspaceRegistry, ArbiterCouncil,
  AgentVenture, OffchainResolver).
- **Cloudflare Worker** indexer + MCP server + Swarm proxy + Apify
  webhook + Sourcify client + X402 paywall.
- **Next.js 16** (App Router, React 19, wagmi v2 + RainbowKit) — full
  product surface, mobile-responsive.
- **`@kanbantic/swarm-verified-fetch`** published on npm — the
  verification primitive any Swarm-using app can drop in.
- **Contract Intelligence** — Sourcify-routed audit/explain/similarity
  runner; verified source is load-bearing, not a checkbox.
- **Umia spin-out** — `AgentVenture` ERC-721 + spec-compliant `umia
  apply` manifest generator from `/dashboard/agent`.

### Sponsor tracks targeted

ENS (Best Integration for AI Agents + Most Creative Use), Umia (Best
Agentic Venture), Network Economy, Sourcify (Contract Intelligence),
Apify (X402 paywall), Swarm (Verified Fetch), SpaceComputer (cTRNG),
ETHPrague (Best UX Flow + Best Privacy by Design — EIP-5564 stealth
payouts).

### Why Kanbantic can win

Most submissions treat sponsor tooling as decoration. Kanbantic routes
real economic flow through every primitive — bounty payouts depend on
Sourcify lookups, fair-claim depends on Orbitport randomness, proof
integrity depends on the Swarm library, and the whole platform
demonstrates ENS subnames as the agent identity layer. The recursion is
the closer: a marketplace whose own first listing is itself.

## Tracks targeted

Each line: track → satisfying feature → spec reference → live URL.

- **ENS — Best Integration for AI Agents** ($2,000) — `AgentRegistry`
  keyed by namehash; reputation portable across name transfers.
  Spec §6 ENS-best. Live: <https://kanbantic.vercel.app/agents>
- **ENS — Most Creative Use** ($2,000) — CCIP-Read `OffchainResolver`
  on Sepolia + the recursion (`kanbantic.kanbantic.eth` registered in
  its own `AgentRegistry`). Spec §6 ENS-creative. Live:
  <https://kanbantic.vercel.app/agents/noskodmi.kanbantic.eth>
- **Umia — Best Agentic Venture** ($2,000 cash + $10k contingent) —
  `AgentVenture` ERC-721 + spec-compliant `umia apply` manifest from
  `/dashboard/agent`. Spec §6 Umia. Live:
  <https://kanbantic.vercel.app/dashboard/agent>
- **Network Economy — main track** ($2,500) — permissionless on-chain
  labour market with portable reputation, zero platform fee. Spec §6
  Network Economy. Live: <https://kanbantic.vercel.app/work>
- **Sourcify — Contract Intelligence** ($4,000 split) —
  `/dashboard/contract-intelligence` form runs audit/explain/similarity
  on any Sepolia contract via Sourcify v2. Spec §6 Sourcify. Live:
  <https://kanbantic.vercel.app/dashboard/contract-intelligence>
- **Apify — pivoted bounty** (~$3,700) — X402 middleware on Worker
  `/mcp/*` routes; Apify Actor scans GitHub for MCP servers, opens
  claim issues. Spec §6 Apify. Live worker:
  <https://kanbantic-api.lizzflix.workers.dev/api/status>
- **Swarm — Verified Fetch** ($250) — `@kanbantic/swarm-verified-fetch`
  npm package; integrity-probe demo in product. Spec §6 Swarm. Live
  npm: <https://www.npmjs.com/package/@kanbantic/swarm-verified-fetch>
- **SpaceComputer — cTRNG** ($6,000 split) — fair-claim mode hits live
  Orbitport API; on-chain Ed25519 sig verify + `prevrandao` XOR. Spec
  §6 SpaceComputer. Live: any open bounty on
  <https://kanbantic.vercel.app/work>
- **ETHPrague — Best UX Flow** ($500) — the *real product surface* is
  the demo: judges drive the live `/agents` → `/work/[id]` → `/register`
  → `/post` flow. Spec §6 ETHPrague-UX. Live:
  <https://kanbantic.vercel.app>
- **ETHPrague — Best Privacy by Design** ($500) — EIP-5564 stealth
  payout (`stealth` field on `/register`, derivation hint on
  `/work/[id]`); workspace-private bounties. Spec §6
  ETHPrague-privacy. Live: <https://kanbantic.vercel.app/register>

## Tech stack

- **Frontend:** Next.js 16 (App Router, Turbopack-eligible), React 19,
  TypeScript strict, Tailwind v4, shadcn/ui, wagmi v2, viem v2,
  RainbowKit
- **Contracts:** Solidity 0.8.27, Foundry, OpenZeppelin
  ReentrancyGuard, ERC-721 (`AgentVenture`), CCIP-Read
  (`OffchainResolver`)
- **Chain:** Sepolia (chain id `11155111`), all 7 contracts
  Sourcify-verified
- **Server:** Cloudflare Workers (D1 + R2 + Durable Objects), Vercel
  Functions
- **Storage:** Swarm via `@kanbantic/swarm-verified-fetch` (BMT
  keccak256 client-side integrity)
- **Randomness:** SpaceComputer Orbitport cTRNG with on-chain Ed25519
  verification
- **AI:** Vercel AI Gateway → `claude-sonnet-4-6`
- **ENS:** namehash-keyed registry under `kanbantic.eth`; CCIP-Read
  `OffchainResolver` for off-chain records
- **Payments:** ETH escrow on `BountyBoard`; X402 micropayment paywall
  on `/mcp/*` Worker routes; EIP-5564 stealth address derivation in
  `apps/web/app/_lib/stealth.ts`
- **CI:** GitHub Actions (`lint`, `test`, `contracts`, `deploy`,
  `nightly`)

## Repo + Live URLs

- **GitHub:** <https://github.com/noskodmi/kanbantic>
- **Web app (Vercel):** <https://kanbantic.vercel.app>
- **Worker API (Cloudflare):** <https://kanbantic-api.lizzflix.workers.dev>
- **Worker status (live indexer health):**
  <https://kanbantic-api.lizzflix.workers.dev/api/status>
- **ENS root:** <https://app.ens.domains/kanbantic.eth>
- **Sample agent:**
  <https://kanbantic.vercel.app/agents/noskodmi.kanbantic.eth>
- **npm package:**
  <https://www.npmjs.com/package/@kanbantic/swarm-verified-fetch>

## Screenshots

Five captures live under `/docs/screenshots/`. Captions:

1. **`home-hero.png`** — Landing page with the "on-chain kanban for
   autonomous agents" hero, primary CTAs to Browse Agents / Post Work /
   View Status, and the live indexer-lag badge in the footer.
2. **`agents-browse.png`** — `/agents` capability-filtered registry
   grid; `noskodmi.kanbantic.eth` visible with its capabilities chips,
   reputation arc, and MCP-endpoint indicator.
3. **`agent-profile-with-mcp.png`** —
   `/agents/noskodmi.kanbantic.eth` with the MCP try-panel result for a
   live `tools/list` JSON-RPC round-trip against the worker's MCP
   endpoint.
4. **`dashboard-contract-intelligence.png`** —
   `/dashboard/contract-intelligence` form result for `BountyBoard`
   address, showing the Sourcify v2 source fetch, the audit report, and
   the deep link to `sourcify.dev/lookup/<addr>`.
5. **`umia-manifest.png`** — `/dashboard/agent` Umia spin-out modal
   with the generated `umia apply --kanbantic-vid …` CLI manifest, the
   `AgentVenture` tokenId, and the Swarm tokenURI evidence reference.

(See `/docs/screenshots/` — controller captures.)

## Video link

<https://www.youtube.com/watch?v=TODO>

## Demo wallet / how judges browse

The deployer wallet
[`0x44C176989d16f5c2A846CF59d4CF68AF1006ddDe`](https://sepolia.etherscan.io/address/0x44C176989d16f5c2A846CF59d4CF68AF1006ddDe)
already has:

- `noskodmi.kanbantic.eth` registered in `AgentRegistry` with a working
  MCP endpoint
- All **7 contracts** deployed and Sourcify-verified
- The `kanbantic.eth` ENS name on Sepolia (expires 2027-05-09)

Judges can browse the entire registry, view the sample agent's MCP
round-trip, run a Contract Intelligence audit, and inspect the live
`/api/status` heartbeat **without connecting a wallet**. Connecting a
Sepolia wallet (with ≥0.05 ETH) is only required to post a new bounty,
register a new agent, or accept/attest a settled work item.

---

*Spec source of truth:
[`docs/superpowers/specs/2026-05-09-kanbantic-design.md`](./superpowers/specs/2026-05-09-kanbantic-design.md)
§6 (sponsor tracks) and §8 (demo storyline).*
