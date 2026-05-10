import { SELF, env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";

import { applyMigrations } from "../../src/db/migrate.js";

describe("GET /api/work", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM bounties").run();
  });

  it("returns empty array on cold start", async () => {
    const res = await SELF.fetch("https://example.com/api/work");
    expect(res.status).toBe(200);
    const body = await res.json<{ bounties: unknown[]; limit: number }>();
    expect(body.bounties).toEqual([]);
    expect(body.limit).toBe(50);
  });

  it("returns rows ordered by created_at_block DESC", async () => {
    for (let i = 0; i < 3; i++) {
      await env.DB.prepare(
        "INSERT INTO bounties (id, poster, capability, reward, description_ref, expires_at, claim_window_blocks, claim_window_start_block, status, workspace_node, arbiter_council, created_at_block, created_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          i + 1,
          "0xposter",
          "research",
          "1000000000000000",
          "0xref",
          1715400000,
          0,
          100 + i,
          "Open",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0xcouncil",
          100 + i,
          1715300000 + i,
        )
        .run();
    }

    const res = await SELF.fetch("https://example.com/api/work");
    const body = await res.json<{ bounties: Record<string, unknown>[]; limit: number }>();
    expect(body.bounties).toHaveLength(3);
    expect(body.bounties[0]?.["id"]).toBe(3);
    expect(body.bounties[2]?.["id"]).toBe(1);
  });

  it("respects ?limit", async () => {
    for (let i = 0; i < 4; i++) {
      await env.DB.prepare(
        "INSERT INTO bounties (id, poster, capability, reward, description_ref, expires_at, claim_window_blocks, claim_window_start_block, status, workspace_node, arbiter_council, created_at_block, created_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          i + 1,
          "0xposter",
          "research",
          "1000000000000000",
          "0xref",
          1715400000,
          0,
          100 + i,
          "Open",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0xcouncil",
          100 + i,
          1715300000 + i,
        )
        .run();
    }

    const res = await SELF.fetch("https://example.com/api/work?limit=2");
    const body = await res.json<{ bounties: unknown[]; limit: number }>();
    expect(body.bounties).toHaveLength(2);
  });

  it("clamps limit at 200", async () => {
    const res = await SELF.fetch("https://example.com/api/work?limit=99999");
    const body = await res.json<{ limit: number }>();
    expect(body.limit).toBe(200);
  });

  describe("filters + workspace ACL", () => {
    const PUBLIC_ROOT = "0x0000000000000000000000000000000000000000000000000000000000000000";
    // kanbantic.eth root namehash from sepoliaDeployment — also a public root.
    const KANBANTIC_ROOT = "0xb4c81d607382cd32c89297f9a8c9984b690260118843ad2961d043cb2ea948b7";
    const PRIVATE_WS = "0xdeadbeef000000000000000000000000000000000000000000000000deadbeef";

    beforeEach(async () => {
      // Seed: one Open + zero-root, one Claimed + kanbantic-root, one
      // private-workspace bounty (should be hidden from anonymous reads).
      await env.DB.prepare(
        "INSERT INTO bounties (id, poster, capability, reward, description_ref, expires_at, claim_window_blocks, claim_window_start_block, status, claimer_node, workspace_node, arbiter_council, created_at_block, created_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          1,
          "0xposterA",
          "research",
          "100",
          "0xref",
          1715400000,
          0,
          100,
          "Open",
          null,
          PUBLIC_ROOT,
          "0xcouncil",
          100,
          1715300001,
        )
        .run();
      await env.DB.prepare(
        "INSERT INTO bounties (id, poster, capability, reward, description_ref, expires_at, claim_window_blocks, claim_window_start_block, status, claimer_node, workspace_node, arbiter_council, created_at_block, created_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          2,
          "0xposterB",
          "translation",
          "200",
          "0xref",
          1715400000,
          0,
          101,
          "Claimed",
          "0xclaimerNode",
          KANBANTIC_ROOT,
          "0xcouncil",
          101,
          1715300002,
        )
        .run();
      await env.DB.prepare(
        "INSERT INTO bounties (id, poster, capability, reward, description_ref, expires_at, claim_window_blocks, claim_window_start_block, status, claimer_node, workspace_node, arbiter_council, created_at_block, created_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          3,
          "0xposterC",
          "research",
          "300",
          "0xref",
          1715400000,
          0,
          102,
          "Open",
          null,
          PRIVATE_WS,
          "0xcouncil",
          102,
          1715300003,
        )
        .run();
    });

    it("hides private-workspace bounties when no Authorization header", async () => {
      const res = await SELF.fetch("https://example.com/api/work");
      const body = await res.json<{ bounties: { id: number }[] }>();
      const ids = body.bounties.map((b) => b.id).sort();
      expect(ids).toEqual([1, 2]);
    });

    it("?status= filters by exact (case-sensitive) enum", async () => {
      const res = await SELF.fetch("https://example.com/api/work?status=Claimed");
      const body = await res.json<{ bounties: { id: number; status: string }[] }>();
      expect(body.bounties).toHaveLength(1);
      expect(body.bounties[0]?.status).toBe("Claimed");
    });

    it("?capability= filters by CSV substring (case-insensitive)", async () => {
      const res = await SELF.fetch("https://example.com/api/work?capability=RESEARCH");
      const body = await res.json<{ bounties: { id: number }[] }>();
      // Only id=1 — id=3 is in a private workspace and hidden by ACL.
      expect(body.bounties.map((b) => b.id)).toEqual([1]);
    });

    it("?poster= filters by exact (case-insensitive) poster", async () => {
      const res = await SELF.fetch("https://example.com/api/work?poster=0XPOSTERB");
      const body = await res.json<{ bounties: { id: number }[] }>();
      expect(body.bounties.map((b) => b.id)).toEqual([2]);
    });

    it("?claimer_node= filters by exact (case-insensitive) claimer", async () => {
      const res = await SELF.fetch("https://example.com/api/work?claimer_node=0xCLAIMERNODE");
      const body = await res.json<{ bounties: { id: number }[] }>();
      expect(body.bounties.map((b) => b.id)).toEqual([2]);
    });

    it("?workspace= constrained to a private namehash returns empty (ACL)", async () => {
      const res = await SELF.fetch(`https://example.com/api/work?workspace=${PRIVATE_WS}`);
      const body = await res.json<{ bounties: { id: number }[] }>();
      expect(body.bounties).toEqual([]);
    });

    it("?workspace= constrained to kanbantic root returns its bounties", async () => {
      const res = await SELF.fetch(`https://example.com/api/work?workspace=${KANBANTIC_ROOT}`);
      const body = await res.json<{ bounties: { id: number }[] }>();
      expect(body.bounties.map((b) => b.id)).toEqual([2]);
    });
  });
});

describe("GET /api/work/:id", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM bounties").run();
    await env.DB.prepare("DELETE FROM bounty_history").run();
    await env.DB.prepare("DELETE FROM attestations").run();
    await env.DB.prepare("DELETE FROM agents").run();
    await env.DB.prepare("DELETE FROM agent_reputation").run();
  });

  it("returns 404 for unknown bounty id", async () => {
    const res = await SELF.fetch("https://example.com/api/work/9999");
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("not_found");
  });

  it("returns 400 for non-numeric id", async () => {
    const res = await SELF.fetch("https://example.com/api/work/abc");
    expect(res.status).toBe(400);
  });

  it("returns 404 when the bounty's workspace is private (no SIWE yet)", async () => {
    await env.DB.prepare(
      "INSERT INTO bounties (id, poster, capability, reward, description_ref, expires_at, claim_window_blocks, claim_window_start_block, status, workspace_node, arbiter_council, created_at_block, created_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        7,
        "0xposter",
        "research",
        "100",
        "0xref",
        1715400000,
        0,
        100,
        "Open",
        "0xprivatews000000000000000000000000000000000000000000000000000007",
        "0xcouncil",
        100,
        1715300000,
      )
      .run();
    const res = await SELF.fetch("https://example.com/api/work/7");
    expect(res.status).toBe(404);
  });

  it("returns the bounty + history + attestations + claimer agent join", async () => {
    await env.DB.prepare(
      "INSERT INTO bounties (id, poster, capability, reward, description_ref, expires_at, claim_window_blocks, claim_window_start_block, status, claimer_node, claimer_address, workspace_node, arbiter_council, created_at_block, created_at_ts, resolved_at_block) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        11,
        "0xposter",
        "research",
        "1000000000000000",
        "0xref",
        1715400000,
        0,
        100,
        "Resolved",
        "0xclaimerNode",
        "0xclaimerAddr",
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        "0xcouncil",
        100,
        1715300000,
        110,
      )
      .run();
    await env.DB.prepare(
      "INSERT INTO bounty_history (bounty_id, status_from, status_to, tx_hash, log_index, block_number, ts) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(11, null, "Open", "0xtx1", 0, 100, 1715300000)
      .run();
    await env.DB.prepare(
      "INSERT INTO bounty_history (bounty_id, status_from, status_to, tx_hash, log_index, block_number, ts) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(11, "Open", "Claimed", "0xtx2", 0, 105, 1715300050)
      .run();
    await env.DB.prepare(
      "INSERT INTO attestations (bounty_id, agent_node, reviewer, score, comment_ref, ts) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(11, "0xclaimerNode", "0xreviewer", 5, null, 1715300100)
      .run();
    await env.DB.prepare(
      "INSERT INTO agents (node, parent, owner, label, mcp_endpoint, capabilities, registered_at_block, registered_at_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(
        "0xclaimerNode",
        "0xparent",
        "0xowner",
        "claimer",
        "https://x/mcp",
        "research",
        99,
        1715299999,
      )
      .run();

    const res = await SELF.fetch("https://example.com/api/work/11");
    expect(res.status).toBe(200);
    const body = await res.json<{
      bounty: { id: number; status: string };
      history: { status_to: string }[];
      claimer_agent: { label: string } | null;
      attestations: { score: number }[];
    }>();
    expect(body.bounty.id).toBe(11);
    expect(body.bounty.status).toBe("Resolved");
    expect(body.history.map((h) => h.status_to)).toEqual(["Open", "Claimed"]);
    expect(body.claimer_agent?.label).toBe("claimer");
    expect(body.attestations).toHaveLength(1);
    expect(body.attestations[0]?.score).toBe(5);
  });
});
