import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { applyMigrations } from "../src/db/migrate.js";

describe("applyMigrations", () => {
  it("creates all 12 product tables + _migrations", async () => {
    await applyMigrations(env.DB);

    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    ).all<{ name: string }>();
    const names = result.results.map((r) => r.name);

    for (const expected of [
      "_migrations",
      "agent_reputation",
      "agents",
      "arbiter_decisions",
      "arbiter_votes",
      "attestations",
      "bounties",
      "bounty_history",
      "claim_commitments",
      "discovered_agents_apify",
      "index_cursor",
      "mcp_session_log",
      "workspace_members",
      "workspaces",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("is idempotent — running twice produces identical state", async () => {
    await applyMigrations(env.DB);
    await applyMigrations(env.DB);

    const applied = await env.DB.prepare("SELECT filename FROM _migrations ORDER BY filename").all<{
      filename: string;
    }>();
    expect(applied.results.map((r) => r.filename)).toEqual(["0001_initial.sql"]);
  });
});
