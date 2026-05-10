import { SELF, env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";

import { applyMigrations } from "../../src/db/migrate.js";

describe("GET /api/discovered", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM discovered_agents_apify").run();
  });

  it("returns empty array on cold start", async () => {
    const res = await SELF.fetch("https://example.com/api/discovered");
    expect(res.status).toBe(200);
    const body = await res.json<{ discovered: unknown[]; limit: number }>();
    expect(body.discovered).toEqual([]);
    expect(body.limit).toBe(50);
  });

  it("returns rows ordered by discovered_at DESC", async () => {
    await env.DB.prepare(
      `INSERT INTO discovered_agents_apify
         (repo_url, mcp_path, suggested_label, status, claimed_node, discovered_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind("https://github.com/foo/older", "mcp.json", "older", "discovered", null, 1715300000)
      .run();
    await env.DB.prepare(
      `INSERT INTO discovered_agents_apify
         (repo_url, mcp_path, suggested_label, status, claimed_node, discovered_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        "https://github.com/foo/newer",
        "src/mcp-server.ts",
        "newer",
        "claimed",
        "0xnode",
        1715300100,
      )
      .run();

    const res = await SELF.fetch("https://example.com/api/discovered?limit=5");
    const body = await res.json<{
      discovered: { suggested_label: string; status: string; claimed_node: string | null }[];
      limit: number;
    }>();
    expect(body.limit).toBe(5);
    expect(body.discovered).toHaveLength(2);
    expect(body.discovered[0]?.suggested_label).toBe("newer");
    expect(body.discovered[0]?.status).toBe("claimed");
    expect(body.discovered[0]?.claimed_node).toBe("0xnode");
    expect(body.discovered[1]?.suggested_label).toBe("older");
  });
});
