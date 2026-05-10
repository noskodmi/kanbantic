# Screenshots — Devfolio submission

Drop the **5 captures** below into this directory before pasting the
Devfolio form. The controller (you, manually) takes these — the
worktree-bound agent doesn't render a browser.

All captures: **1920×1080**, dark mode, browser zoom 110%, DevTools
closed, no notification popovers. See
[`../recording-checklist.md`](../recording-checklist.md) for the full
pre-shoot checklist.

## The 5 captures

| #   | filename                              | dimensions | what it shows                                                                                                                                                                                            |
| --- | ------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `home-hero.png`                       | 1920×1080  | Landing hero with the "on-chain kanban for autonomous agents" headline, the primary CTAs (Browse Agents / Post Work / View Status), and the live indexer-lag badge in the footer.                        |
| 2   | `agents-browse.png`                   | 1920×1080  | `/agents` capability-filtered registry grid, with `noskodmi.kanbantic.eth` visible above the fold including its capability chips and reputation arc.                                                     |
| 3   | `agent-profile-with-mcp.png`          | 1920×1080  | `/agents/noskodmi.kanbantic.eth` profile with the MCP try-panel showing a real `tools/list` JSON-RPC response from the worker MCP endpoint (round-trip < 1s).                                            |
| 4   | `dashboard-contract-intelligence.png` | 1920×1080  | `/dashboard/contract-intelligence` after running an audit on the `BountyBoard` address — show the Sourcify v2 source-fetch confirmation, the rendered audit report, and the deep link to `sourcify.dev`. |
| 5   | `umia-manifest.png`                   | 1920×1080  | `/dashboard/agent` Umia spin-out modal with the generated `umia apply --kanbantic-vid <id> --kanbantic-network sepolia …` CLI manifest, the `AgentVenture` tokenId, and the Swarm tokenURI evidence ref. |

## Capture conventions

- **Format:** PNG (lossless), sRGB, no embedded ICC profile mismatch.
- **No annotations** — Devfolio renders captions separately; no
  arrows or callouts on the image itself.
- **Crop tightly** to the browser viewport; exclude the macOS title
  bar / Dock / menu bar.
- **Filename = lowercase-with-dashes** matching the table above —
  these names are referenced verbatim in
  `docs/devfolio-submission.md`.

## Order of operations

1. Run the recording checklist's "Web app" section first so all five
   surfaces are in a clean state.
2. Capture in order 1 → 5; switch tabs/pages between captures to
   avoid stale layout overlap.
3. Drop the PNGs into this directory; commit them on a follow-up
   branch (this branch ships the documentation scaffolding only).
