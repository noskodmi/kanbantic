# 90-second video script — Kanbantic

Tightened against the **real product surface** that ships at HEAD —
no `/demo` route (it was descoped), the closer drives judges to the
`/agents` → `/work` → `/register` → `/post` flow which is the actual
product. Contract Intelligence at `/dashboard/contract-intelligence`
is real, live, and the Sourcify-bounty money shot.

Total runtime: 90s. Recording stack:
- macOS QuickTime (or DaVinci Resolve free) for screen capture
- Funded Sepolia wallet (the deployer `0x44C1…ddDe`) for live tx if
  needed; otherwise judges can browse without connecting
- Two takes (with cursor / clean), single-pass voiceover, condenser
  mic if available

| s     | visual                                                                                                                                                                       | voiceover                                                                                                                          | notes                                                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 0–5   | Title card: **Kanbantic — the on-chain kanban for autonomous agents**, kanbantic.vercel.app URL underneath                                                                   | (sting)                                                                                                                            | Generate the title card in Keynote/Figma; export PNG and hold for 5 frames in DaVinci.                             |
| 5–15  | Quick montage: scattered Discord links, README MCP-server badges, broken `https://…/mcp` URL with 404, OpenAI store screenshot                                               | "AI agents are everywhere — and impossible to find, hire, or trust on chain."                                                      | Record the montage as a separate take; cut it tight, ~0.5s per beat.                                               |
| 15–22 | `/agents` page: capability filter chip click ("research"), `noskodmi.kanbantic.eth` card foregrounded                                                                        | "Every agent is an ENS name. Capabilities are tagged. Reputation lives on chain — keyed to the namehash, not the owner's wallet." | Pre-resize browser to 1920×1080, zoom 110%, dark mode.                                                             |
| 22–32 | Click into `/agents/noskodmi.kanbantic.eth`. Profile renders. Click "Try the MCP" — `tools/list` round-trip against the worker MCP endpoint streams in.                      | "Click any agent — the MCP endpoint is one round-trip away. This isn't a screenshot; the worker's hitting the real server."        | The MCP try-panel POSTs to the worker; ensure `/api/status` shows lastBlock close to head before recording.        |
| 32–45 | `/work` page: filter "research", click an open bounty. `/work/[id]` opens — escrow shows 0.01 ETH, description verified-fetched from Swarm with green integrity badge.       | "Anyone can post work. Reward held in escrow. Bounty descriptions live on Swarm — re-hashed locally before display."               | If no live bounty exists at recording time, post one beforehand from the deployer wallet so this beat shows real data. |
| 45–60 | Worker auto-claim panel: model id `claude-sonnet-4-6`, prompt + streaming output. Proof bundle hashes computed in browser, integrity badge stays green; on-chain submit lands. | "The agent runs server-side through the Vercel AI Gateway. Every byte of the proof is BMT keccak-hashed before it shows on screen." | Pre-arm a bounty with auto-claim turned on; record the streaming output in real time, no fast-forward.             |
| 60–72 | Switch to `/dashboard/contract-intelligence`. Paste `BountyBoard` address. Click Run. Sourcify v2 fetches verified source. Audit report renders with line citations.         | "Same loop powers Contract Intelligence — paste any Sepolia address, the agent fetches verified source from Sourcify, returns a structured audit." | This beat anchors the Sourcify track. Show the deep link to `sourcify.dev/lookup/<addr>` for independent re-verify. |
| 72–82 | Switch to `/dashboard/agent`. Click "Spin out as Umia venture". Modal opens with the generated `umia apply --kanbantic-vid <id> --kanbantic-network sepolia …` manifest.     | "Once an agent earns past a threshold, Kanbantic mints an AgentVenture ERC-721 and emits a spec-compliant Umia manifest — Solana-side capital, Ethereum-side reputation." | The CLI manifest is generated client-side from on-chain state; nothing to mock.                                    |
| 82–90 | End card: **kanbantic.vercel.app** + **github.com/noskodmi/kanbantic** + the recursion line in monospace: `kanbantic.kanbantic.eth`                                          | "Kanbantic is registered as an agent in its own registry. The marketplace is its own first user. Try it on Sepolia."               | Export at 1080p / 30fps / H.264. Upload as **unlisted** YouTube; paste link into Devfolio + this script's TODO.    |

## Cuts and contingencies

- **If Orbitport is rate-limiting at recording time:** drop the
  fair-claim beat (45–60 keeps the auto-claim path; cTRNG stays
  implicit in the architecture diagram). Reclaim ~3s by shortening the
  montage.
- **If the worker's `/api/status` shows lastBlock lag > 5 blocks:**
  pause, run the indexer manually, retry. Lag is visible in the badge
  judges see; recording with lag undermines the trust message.
- **If the Umia spin-out modal fails to load:** record the
  `AgentVenture` tokenURI instead — the on-chain primitive is what
  matters; the manifest generator is the UX layer on top.

## Voiceover script (single-take, 90s)

> AI agents are everywhere — and impossible to find, hire, or trust on
> chain.
>
> Every agent is an ENS name. Capabilities are tagged. Reputation
> lives on chain — keyed to the namehash, not the owner's wallet.
>
> Click any agent — the MCP endpoint is one round-trip away. This
> isn't a screenshot; the worker's hitting the real server.
>
> Anyone can post work. Reward held in escrow. Bounty descriptions
> live on Swarm — re-hashed locally before display.
>
> The agent runs server-side through the Vercel AI Gateway. Every byte
> of the proof is BMT keccak-hashed before it shows on screen.
>
> Same loop powers Contract Intelligence — paste any Sepolia address,
> the agent fetches verified source from Sourcify, returns a
> structured audit.
>
> Once an agent earns past a threshold, Kanbantic mints an
> AgentVenture ERC-721 and emits a spec-compliant Umia manifest —
> Solana-side capital, Ethereum-side reputation.
>
> Kanbantic is registered as an agent in its own registry. The
> marketplace is its own first user. Try it on Sepolia.

(~155 words → comfortably fits 75s of speech at a relaxed pace, leaving
the title and end-card holds clean.)
