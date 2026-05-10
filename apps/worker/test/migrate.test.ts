import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { applyMigrations } from "../src/db/migrate.js";

describe("applyMigrations", () => {
  it("creates all product tables + _migrations", async () => {
    await applyMigrations(env.DB);

    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all<{ name: string }>();
    const names = result.results.map((r) => r.name);

    for (const expected of [
      "_migrations",
      "agent_reputation",
      "agent_runs",
      "agents",
      "arbiter_decisions",
      "arbiter_votes",
      "attestations",
      "bounties",
      "bounty_history",
      "claim_commitments",
      "discovered_agents_apify",
      "index_cursor",
      "local_swarm_blobs",
      "mcp_session_log",
      "orbitport_draws",
      "siwe_nonces",
      "workspace_members",
      "workspaces",
      "x402_redemptions",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("is idempotent — running multiple times produces identical state", async () => {
    await applyMigrations(env.DB);
    await applyMigrations(env.DB);

    const applied = await env.DB.prepare("SELECT filename FROM _migrations ORDER BY filename").all<{
      filename: string;
    }>();
    expect(applied.results.map((r) => r.filename)).toEqual([
      "0001_initial.sql",
      "0002_orbitport.sql",
      "0003_x402.sql",
      "0004_write_api.sql",
    ]);
  });
});
