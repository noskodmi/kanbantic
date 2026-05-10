import { SELF, env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";

import { applyMigrations } from "../../src/db/migrate.js";

describe("GET /api/agents", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM agents").run();
    await env.DB.prepare("DELETE FROM agent_reputation").run();
  });

  it("returns empty array on cold start", async () => {
    const res = await SELF.fetch("https://example.com/api/agents");
    expect(res.status).toBe(200);
    const body = await res.json<{ agents: unknown[]; limit: number }>();
    expect(body.agents).toEqual([]);
    expect(body.limit).toBe(50);
  });

  it("returns rows with reputation joined", async () => {
    await env.DB.prepare(
      "INSERT INTO agents (node, parent, owner, label, mcp_endpoint, capabilities, registered_at_block, registered_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind("0xnode1", "0xparent", "0xowner", "alice", "https://x/mcp", "research", 100, 1715300000)
      .run();
    await env.DB.prepare(
      "INSERT INTO agent_reputation (node, score, attestation_count, last_updated) VALUES (?, ?, ?, ?)",
    )
      .bind("0xnode1", 4.5, 7, 1715300100)
      .run();

    const res = await SELF.fetch("https://example.com/api/agents");
    const body = await res.json<{ agents: Record<string, unknown>[]; limit: number }>();
    expect(body.agents).toHaveLength(1);
    const a = body.agents[0];
    expect(a?.["node"]).toBe("0xnode1");
    expect(a?.["label"]).toBe("alice");
    expect(a?.["reputation_score"]).toBe(4.5);
    expect(a?.["reputation_count"]).toBe(7);
  });

  it("respects ?limit query param", async () => {
    for (let i = 0; i < 5; i++) {
      await env.DB.prepare(
        "INSERT INTO agents (node, parent, owner, label, mcp_endpoint, capabilities, registered_at_block, registered_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          `0xnode${String(i)}`,
          "0xparent",
          "0xowner",
          `agent${String(i)}`,
          "https://x/mcp",
          "research",
          100 + i,
          1715300000 + i,
        )
        .run();
    }

    const res = await SELF.fetch("https://example.com/api/agents?limit=2");
    const body = await res.json<{ agents: unknown[]; limit: number }>();
    expect(body.agents).toHaveLength(2);
    expect(body.limit).toBe(2);
  });

  it("clamps limit at 200", async () => {
    const res = await SELF.fetch("https://example.com/api/agents?limit=99999");
    const body = await res.json<{ limit: number }>();
    expect(body.limit).toBe(200);
  });

  describe("filters", () => {
    beforeEach(async () => {
      // Three agents — one matches each filter dimension, one matches none.
      await env.DB.prepare(
        "INSERT INTO agents (node, parent, owner, label, mcp_endpoint, capabilities, registered_at_block, registered_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          "0xnodeA",
          "0xparentP",
          "0xownerA",
          "alice",
          "https://x/mcp",
          "research,writing",
          100,
          1715300001,
        )
        .run();
      await env.DB.prepare(
        "INSERT INTO agents (node, parent, owner, label, mcp_endpoint, capabilities, registered_at_block, registered_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          "0xnodeB",
          "0xparentP",
          "0xownerB",
          "bob",
          "https://x/mcp",
          "translation",
          101,
          1715300002,
        )
        .run();
      await env.DB.prepare(
        "INSERT INTO agents (node, parent, owner, label, mcp_endpoint, capabilities, registered_at_block, registered_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          "0xnodeC",
          "0xparentQ",
          "0xownerC",
          "carol",
          "https://x/mcp",
          "research,art",
          102,
          1715300003,
        )
        .run();

      await env.DB.prepare(
        "INSERT INTO agent_reputation (node, score, attestation_count, last_updated) VALUES (?, ?, ?, ?)",
      )
        .bind("0xnodeA", 4.6, 5, 1715300100)
        .run();
      await env.DB.prepare(
        "INSERT INTO agent_reputation (node, score, attestation_count, last_updated) VALUES (?, ?, ?, ?)",
      )
        .bind("0xnodeB", 2.1, 3, 1715300100)
        .run();
      // C has no reputation row → score 0.
    });

    it("?capability= filters by CSV substring (case-insensitive)", async () => {
      const res = await SELF.fetch("https://example.com/api/agents?capability=Research");
      const body = await res.json<{ agents: { label: string }[] }>();
      const labels = body.agents.map((a) => a.label).sort();
      expect(labels).toEqual(["alice", "carol"]);
    });

    it("?owner= filters by exact (case-insensitive) owner address", async () => {
      const res = await SELF.fetch("https://example.com/api/agents?owner=0XOWNERB");
      const body = await res.json<{ agents: { label: string }[] }>();
      expect(body.agents.map((a) => a.label)).toEqual(["bob"]);
    });

    it("?reputationMin= drops agents below the threshold", async () => {
      const res = await SELF.fetch("https://example.com/api/agents?reputationMin=4");
      const body = await res.json<{ agents: { label: string }[] }>();
      expect(body.agents.map((a) => a.label)).toEqual(["alice"]);
    });

    it("?workspace= filters by parent namehash", async () => {
      const res = await SELF.fetch("https://example.com/api/agents?workspace=0xparentQ");
      const body = await res.json<{ agents: { label: string }[] }>();
      expect(body.agents.map((a) => a.label)).toEqual(["carol"]);
    });

    it("combines filters with AND semantics", async () => {
      const res = await SELF.fetch(
        "https://example.com/api/agents?capability=research&reputationMin=4",
      );
      const body = await res.json<{ agents: { label: string }[] }>();
      expect(body.agents.map((a) => a.label)).toEqual(["alice"]);
    });
  });
});

describe("GET /api/agents/:node", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM agents").run();
    await env.DB.prepare("DELETE FROM agent_reputation").run();
    await env.DB.prepare("DELETE FROM attestations").run();
    await env.DB.prepare("DELETE FROM bounties").run();
  });

  it("returns 404 for an unknown node", async () => {
    const res = await SELF.fetch("https://example.com/api/agents/0xdoesnotexist");
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("not_found");
  });

  it("returns the agent + reputation + recent attestations + claimed bounties", async () => {
    await env.DB.prepare(
      "INSERT INTO agents (node, parent, owner, label, mcp_endpoint, capabilities, registered_at_block, registered_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind("0xnode1", "0xparent", "0xowner", "alice", "https://x/mcp", "research", 100, 1715300000)
      .run();
    await env.DB.prepare(
      "INSERT INTO agent_reputation (node, score, attestation_count, last_updated) VALUES (?, ?, ?, ?)",
    )
      .bind("0xnode1", 4.5, 7, 1715300100)
      .run();
    await env.DB.prepare(
      "INSERT INTO attestations (bounty_id, agent_node, reviewer, score, comment_ref, ts) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(42, "0xnode1", "0xreviewer", 5, "swarm://abc", 1715300200)
      .run();
    await env.DB.prepare(
      "INSERT INTO bounties (id, poster, capability, reward, description_ref, expires_at, claim_window_blocks, claim_window_start_block, status, claimer_node, claimer_address, workspace_node, arbiter_council, created_at_block, created_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        42,
        "0xposter",
        "research",
        "1000000000000000",
        "0xref",
        1715400000,
        0,
        100,
        "Resolved",
        "0xnode1",
        "0xclaimer",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0xcouncil",
        100,
        1715300000,
      )
      .run();

    const res = await SELF.fetch("https://example.com/api/agents/0xnode1");
    expect(res.status).toBe(200);
    const body = await res.json<{
      agent: { label: string; reputation_score: number };
      attestations: { bounty_id: number; score: number }[];
      recent_bounties: { id: number; status: string }[];
    }>();
    expect(body.agent.label).toBe("alice");
    expect(body.agent.reputation_score).toBe(4.5);
    expect(body.attestations).toHaveLength(1);
    expect(body.attestations[0]?.bounty_id).toBe(42);
    expect(body.recent_bounties).toHaveLength(1);
    expect(body.recent_bounties[0]?.status).toBe("Resolved");
  });

  it("matches the :node param case-insensitively", async () => {
    await env.DB.prepare(
      "INSERT INTO agents (node, parent, owner, label, mcp_endpoint, capabilities, registered_at_block, registered_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind("0xabc", "0xp", "0xo", "lower", "https://x/mcp", "x", 100, 1715300000)
      .run();
    const res = await SELF.fetch("https://example.com/api/agents/0xABC");
    expect(res.status).toBe(200);
    const body = await res.json<{ agent: { label: string } }>();
    expect(body.agent.label).toBe("lower");
  });
});
