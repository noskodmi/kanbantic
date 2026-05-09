import { env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations } from "../../src/db/migrate.js";

const CHAIN_ID = 11155111;

interface JsonRpcRequest {
  method: string;
}

function readMethod(init: RequestInit | undefined): string {
  const raw = init?.body;
  const body = typeof raw === "string" ? raw : "";
  const parsed = JSON.parse(body) as JsonRpcRequest;
  return parsed.method;
}

describe("IndexerCursor.tick", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("advances cursor when chain head is ahead", async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM index_cursor").run();

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        const method = readMethod(init);
        if (method === "eth_blockNumber") {
          return Promise.resolve(new Response(JSON.stringify({ result: "0x64" })));
        }
        if (method === "eth_getLogs") {
          return Promise.resolve(new Response(JSON.stringify({ result: [] })));
        }
        return Promise.resolve(new Response("{}"));
      }),
    );

    const id = env.INDEXER.idFromName("singleton");
    const stub = env.INDEXER.get(id);
    const response = await stub.fetch("https://internal/tick");
    expect(response.status).toBe(200);
    const result = await response.json<{
      from: number;
      to: number;
      logs: number;
    }>();
    expect(result.from).toBe(1);
    expect(result.to).toBe(99);
    expect(result.logs).toBe(0);

    const row = await env.DB.prepare("SELECT last_block FROM index_cursor WHERE chain_id = ?")
      .bind(CHAIN_ID)
      .first<{ last_block: number }>();
    expect(row?.last_block).toBe(99);
  });

  it("no-ops when cursor is already at head", async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("INSERT OR REPLACE INTO index_cursor (chain_id, last_block) VALUES (?, ?)")
      .bind(CHAIN_ID, 99)
      .run();

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        const method = readMethod(init);
        if (method === "eth_blockNumber") {
          return Promise.resolve(new Response(JSON.stringify({ result: "0x64" })));
        }
        return Promise.resolve(new Response(JSON.stringify({ result: [] })));
      }),
    );

    const id = env.INDEXER.idFromName("singleton");
    const stub = env.INDEXER.get(id);
    const response = await stub.fetch("https://internal/tick");
    const result = await response.json<{ logs: number }>();
    expect(result.logs).toBe(0);
  });
});
