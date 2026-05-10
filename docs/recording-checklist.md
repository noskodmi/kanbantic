# Recording checklist — 90s submission video

Run top-to-bottom **the same day** you record. Anything red here will
show up in the recording.

## Wallet + chain

- [ ] MetaMask connected to **Sepolia** (chain id `11155111`).
- [ ] Active wallet is the deployer
      `0x44C176989d16f5c2A846CF59d4CF68AF1006ddDe` *or* a wallet with
      ≥ 0.05 ETH on Sepolia for any live posts/accepts during the
      shoot.
- [ ] `noskodmi.kanbantic.eth` is registered and resolves on
      `/agents/noskodmi.kanbantic.eth`.

## Worker / indexer

- [ ] `https://kanbantic-api.lizzflix.workers.dev/api/status` returns
      200 with `lastBlock` close to current Sepolia head (lag < 5
      blocks).
- [ ] Verify in shell:
      ```bash
      WORKER=$(curl -s https://kanbantic-api.lizzflix.workers.dev/api/status | python3 -c 'import json,sys;print(json.load(sys.stdin)["lastBlock"])')
      HEAD=$(curl -s -X POST https://ethereum-sepolia-rpc.publicnode.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' | python3 -c 'import json,sys;print(int(json.load(sys.stdin)["result"],16))')
      echo "worker=$WORKER head=$HEAD lag=$((HEAD - WORKER))"
      ```
      Expect `lag` ≤ 5.
- [ ] All 7 contract entries in `/api/status > contracts` are
      non-zero addresses.
- [ ] Worker MCP endpoint responds to a manual `tools/list` POST (the
      MCP try-panel will hit it during Act 1 of the shoot).

## Web app

- [ ] `https://kanbantic.vercel.app` landing renders without
      hydration errors (DevTools console clean, no red).
- [ ] `/agents` shows the registry grid with `noskodmi.kanbantic.eth`
      visible above the fold.
- [ ] `/agents/noskodmi.kanbantic.eth` renders profile + MCP try-panel.
- [ ] `/work` lists at least one open bounty (post one from the
      deployer wallet beforehand if the list is empty — recording an
      empty marketplace kills the message).
- [ ] `/dashboard/contract-intelligence` loads; pasting `BountyBoard`
      address returns a real Sourcify-fetched audit within ~25s.
- [ ] `/dashboard/agent` Umia spin-out modal renders the generated
      `umia apply` manifest for the deployer's agent.

## Browser / display

- [ ] Browser zoom **110%** (consistent with the screenshot
      conventions in `/docs/screenshots/README.md`).
- [ ] **Dark mode** active.
- [ ] Window resized to **1920×1080** logical pixels (use
      `cmd+option+i` then close DevTools — never record with
      DevTools open).
- [ ] Bookmarks bar hidden (`cmd+shift+b`).
- [ ] No notification popovers (Slack / Linear / Mail muted; macOS
      Focus mode "Do Not Disturb" on).
- [ ] Screen recording app (QuickTime or DaVinci Resolve free)
      configured for 1080p / 30fps / no audio source (voiceover is a
      separate track).

## Recording discipline

- [ ] **Two takes:**
      1. With cursor visible (helps judges follow click targets)
      2. Clean (cursor hidden via `Cursorcerer` or similar) — used
         when the click target is obvious from context
- [ ] **Voiceover:** single pass, condenser mic if available, recorded
      directly into DaVinci or Audacity; lay over the video, do not
      record with system audio.
- [ ] No fast-forwards, no time-lapses — judges are watching for
      proof that the product is real, not for editing flair.
- [ ] Title card and end card hold ≥ 1.5s each so judges can read
      the URLs.

## Post-record

- [ ] Export at 1080p / 30fps / H.264, target file ≤ 100MB.
- [ ] Upload to YouTube as **unlisted**.
- [ ] Paste the YouTube URL into:
  - `docs/video-script-90s.md` end card row
  - `docs/devfolio-submission.md` Video link section
  - The Devfolio submission form's video field
- [ ] Watch the upload back at 1× and 1.25× — sanity-check that the
      audio is in sync and nothing distorts at compression.
