-- Phase 2A initial schema. Indexer rebuilds D1 entirely from chain state
-- if dropped, so this migration is the single source of truth for the
-- read-side schema.
--
-- Re-org rollback is only wired up for `bounties` + `bounty_history` (which
-- carry block_number). `claim_commitments`, `attestations`, `arbiter_votes`,
-- `arbiter_decisions`, `agent_reputation`, `discovered_agents_apify`, and
-- `mcp_session_log` are append-only by event log here and lack the column
-- needed for selective rollback. Phase 2B adds block_number to the ones
-- that actually re-org under our usage.

CREATE TABLE IF NOT EXISTS index_cursor (
  chain_id INTEGER PRIMARY KEY,
  last_block INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS workspaces (
  node TEXT PRIMARY KEY,
  parent TEXT NOT NULL,
  admin TEXT NOT NULL,
  created_at_block INTEGER NOT NULL,
  created_at_ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  ws_node TEXT NOT NULL,
  address TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'removed')),
  added_at_block INTEGER NOT NULL,
  PRIMARY KEY (ws_node, address)
);
CREATE INDEX IF NOT EXISTS workspace_members_address ON workspace_members(address);

CREATE TABLE IF NOT EXISTS agents (
  node TEXT PRIMARY KEY,
  parent TEXT NOT NULL,
  owner TEXT NOT NULL,
  label TEXT NOT NULL,
  mcp_endpoint TEXT NOT NULL,
  capabilities TEXT NOT NULL,
  profile_ref TEXT,
  registered_at_block INTEGER NOT NULL,
  registered_at_ts INTEGER NOT NULL,
  updated_at_block INTEGER
);
CREATE INDEX IF NOT EXISTS agents_owner ON agents(owner);
CREATE INDEX IF NOT EXISTS agents_parent ON agents(parent);

CREATE TABLE IF NOT EXISTS bounties (
  id INTEGER PRIMARY KEY,
  poster TEXT NOT NULL,
  capability TEXT NOT NULL,
  reward TEXT NOT NULL,
  description_ref TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  claim_window_blocks INTEGER NOT NULL,
  claim_window_start_block INTEGER NOT NULL,
  status TEXT NOT NULL,
  claimer_node TEXT,
  claimer_address TEXT,
  submission_ref TEXT,
  workspace_node TEXT NOT NULL,
  arbiter_council TEXT NOT NULL,
  created_at_block INTEGER NOT NULL,
  created_at_ts INTEGER NOT NULL,
  resolved_at_block INTEGER
);
CREATE INDEX IF NOT EXISTS bounties_status ON bounties(status);
CREATE INDEX IF NOT EXISTS bounties_poster ON bounties(poster);
CREATE INDEX IF NOT EXISTS bounties_workspace ON bounties(workspace_node);

CREATE TABLE IF NOT EXISTS bounty_history (
  bounty_id INTEGER NOT NULL,
  status_from TEXT,
  status_to TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (bounty_id, block_number, log_index)
);

CREATE TABLE IF NOT EXISTS claim_commitments (
  bounty_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  commitment_hash TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (bounty_id, address)
);

CREATE TABLE IF NOT EXISTS attestations (
  bounty_id INTEGER NOT NULL,
  agent_node TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  score INTEGER NOT NULL,
  comment_ref TEXT,
  ts INTEGER NOT NULL,
  PRIMARY KEY (bounty_id, reviewer)
);
CREATE INDEX IF NOT EXISTS attestations_agent ON attestations(agent_node);

CREATE TABLE IF NOT EXISTS agent_reputation (
  node TEXT PRIMARY KEY,
  score REAL NOT NULL,
  attestation_count INTEGER NOT NULL,
  last_updated INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS arbiter_votes (
  bounty_id INTEGER NOT NULL,
  arbiter TEXT NOT NULL,
  refund INTEGER NOT NULL CHECK (refund IN (0, 1)),
  reason_ref TEXT,
  ts INTEGER NOT NULL,
  PRIMARY KEY (bounty_id, arbiter)
);

CREATE TABLE IF NOT EXISTS arbiter_decisions (
  bounty_id INTEGER PRIMARY KEY,
  refunded INTEGER NOT NULL CHECK (refunded IN (0, 1)),
  executed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS discovered_agents_apify (
  repo_url TEXT PRIMARY KEY,
  mcp_path TEXT,
  suggested_label TEXT NOT NULL,
  status TEXT NOT NULL,
  claimed_node TEXT,
  discovered_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_session_log (
  agent_node TEXT NOT NULL,
  tool TEXT NOT NULL,
  args_hash TEXT NOT NULL,
  ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS _migrations (
  filename TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
