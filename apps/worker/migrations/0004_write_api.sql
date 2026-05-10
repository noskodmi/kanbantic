-- Phase 2B-A: write API surface (SIWE auth + upload proxy + agent runner).
--
-- Three additive tables:
--
--   siwe_nonces      — one-shot nonces for the EIP-4361 sign-in flow.
--                      A nonce is issued on POST /api/siwe/nonce, then
--                      consumed (`used = 1`) on POST /api/siwe/verify.
--                      A 5-minute TTL is enforced in code; rows older
--                      than that are simply rejected (a periodic GC is
--                      not required for v0.1 — the table is small).
--
--   local_swarm_blobs — fallback storage for /api/upload when the
--                      public Swarm gateway rejects the write
--                      (rate-limit, missing postage stamp). The bytes
--                      are keyed by their BMT root (the same value the
--                      gateway would have returned), so reads via
--                      GET /api/swarm/:ref hit the cache transparently.
--                      `ts` is a UNIX seconds timestamp.
--
--   agent_runs       — bookkeeping for /api/agent/run invocations. One
--                      row per run, status transitions:
--                        'started' → 'submitted' (proof bundle uploaded
--                                                 + tx broadcast),
--                                   → 'proof_only' (worker produced the
--                                                   proof but no deployer
--                                                   key was set so the
--                                                   tx wasn't sent),
--                                   → 'failed'.

CREATE TABLE IF NOT EXISTS siwe_nonces (
  nonce TEXT PRIMARY KEY,
  address TEXT,
  issued_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS siwe_nonces_issued_at ON siwe_nonces(issued_at);

CREATE TABLE IF NOT EXISTS local_swarm_blobs (
  ref TEXT PRIMARY KEY,
  content BLOB NOT NULL,
  ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_node TEXT NOT NULL,
  bounty_id INTEGER NOT NULL,
  proof_ref TEXT,
  tx_hash TEXT,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS agent_runs_bounty_id ON agent_runs(bounty_id);
CREATE INDEX IF NOT EXISTS agent_runs_agent_node ON agent_runs(agent_node);
