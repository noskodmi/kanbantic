import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../../src/db/migrate.js";

describe("POST /api/refresh", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM index_cursor").run();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("triggers a tick and returns the from/to range", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        const raw = init?.body;
        const text = typeof raw === "string" ? raw : "";
        const body = JSON.parse(text) as { method: string };
        if (body.method === "eth_blockNumber") {
          return Promise.resolve(new Response(JSON.stringify({ result: "0xa" })));
        }
        return Promise.resolve(new Response(JSON.stringify({ result: [] })));
      }),
    );
    const response = await SELF.fetch("https://example.com/api/refresh", {
      method: "POST",
    });
    expect(response.status).toBe(200);
    const body = await response.json<{ from: number; to: number; logs: number }>();
    expect(body.from).toBe(1);
    expect(body.to).toBe(9);
    expect(body.logs).toBe(0);
  });

  it("rejects GET", async () => {
    const response = await SELF.fetch("https://example.com/api/refresh");
    expect(response.status).toBe(404);
  });
});
