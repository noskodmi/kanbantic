import { SELF, env } from "cloudflare:test";
import { describe, expect, it, beforeEach } from "vitest";

import { apifyWebhookHandler } from "../../src/api/apify-webhook.js";
import { applyMigrations } from "../../src/db/migrate.js";

const SECRET = "test-secret-do-not-deploy";

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const bytes = new Uint8Array(sig);
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

describe("POST /api/apify-webhook", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM discovered_agents_apify").run();
  });

  it("returns 503 when APIFY_WEBHOOK_SECRET is unset", async () => {
    // SELF.fetch runs in the Worker isolate where bindings are pinned
    // by miniflare config — mutating `env.APIFY_WEBHOOK_SECRET` here
    // doesn't propagate. Instead we call the handler directly with a
    // synthesized env that omits the secret. This is the same code path
    // the router would invoke.
    const envWithoutSecret = { ...env, APIFY_WEBHOOK_SECRET: undefined } as unknown as typeof env;
    const req = new Request("https://example.com/api/apify-webhook", {
      method: "POST",
      body: "[]",
    });
    const res = await apifyWebhookHandler(req, envWithoutSecret);
    expect(res.status).toBe(503);
    const body: { error: string } = await res.json();
    expect(body.error).toMatch(/disabled/);
  });

  it("rejects invalid HMAC with 401", async () => {
    const res = await SELF.fetch("https://example.com/api/apify-webhook", {
      method: "POST",
      headers: { "x-apify-signature": "deadbeef" },
      body: "[]",
    });
    expect(res.status).toBe(401);
  });

  it("rejects missing signature header with 401", async () => {
    const res = await SELF.fetch("https://example.com/api/apify-webhook", {
      method: "POST",
      body: "[]",
    });
    expect(res.status).toBe(401);
  });

  it("upserts records with valid HMAC", async () => {
    const payload = JSON.stringify([
      {
        repo_url: "https://github.com/foo/bar",
        mcp_path: "mcp.json",
        suggested_label: "bar",
        discovered_at: 1715300000,
      },
      {
        repo_url: "https://github.com/baz/qux",
        mcp_path: "src/mcp-server.ts",
        suggested_label: "qux",
        discovered_at: 1715300050,
      },
    ]);
    const sig = await hmacHex(SECRET, payload);

    const res = await SELF.fetch("https://example.com/api/apify-webhook", {
      method: "POST",
      headers: { "x-apify-signature": sig },
      body: payload,
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; ingested: number }>();
    expect(body.ok).toBe(true);
    expect(body.ingested).toBe(2);

    const rows = await env.DB.prepare(
      "SELECT repo_url, suggested_label, status FROM discovered_agents_apify ORDER BY repo_url",
    ).all<{ repo_url: string; suggested_label: string; status: string }>();
    expect(rows.results).toHaveLength(2);
    expect(rows.results[0]?.status).toBe("discovered");
  });

  it("dedupes by repo_url and preserves status on re-discovery", async () => {
    // First the row is claimed.
    await env.DB.prepare(
      `INSERT INTO discovered_agents_apify
         (repo_url, mcp_path, suggested_label, status, claimed_node, discovered_at)
       VALUES (?, ?, ?, 'claimed', ?, ?)`,
    )
      .bind("https://github.com/foo/bar", "mcp.json", "bar", "0xnode", 1715200000)
      .run();

    const payload = JSON.stringify([
      {
        repo_url: "https://github.com/foo/bar",
        mcp_path: "mcp.json",
        suggested_label: "bar",
        discovered_at: 1715300000,
      },
    ]);
    const sig = await hmacHex(SECRET, payload);
    const res = await SELF.fetch("https://example.com/api/apify-webhook", {
      method: "POST",
      headers: { "x-apify-signature": sig },
      body: payload,
    });
    expect(res.status).toBe(200);

    const row = await env.DB.prepare(
      "SELECT status, claimed_node, discovered_at FROM discovered_agents_apify WHERE repo_url = ?",
    )
      .bind("https://github.com/foo/bar")
      .first<{ status: string; claimed_node: string | null; discovered_at: number }>();
    expect(row?.status).toBe("claimed");
    expect(row?.claimed_node).toBe("0xnode");
    expect(row?.discovered_at).toBe(1715300000);
  });

  it("skips malformed records but still 200s the batch", async () => {
    const payload = JSON.stringify([
      { repo_url: "not-a-url", suggested_label: "x", discovered_at: 1 },
      {
        repo_url: "https://github.com/ok/ok",
        suggested_label: "ok",
        discovered_at: 1715300000,
      },
      { repo_url: "https://github.com/foo/bar", suggested_label: "BAD UPPER", discovered_at: 1 },
    ]);
    const sig = await hmacHex(SECRET, payload);
    const res = await SELF.fetch("https://example.com/api/apify-webhook", {
      method: "POST",
      headers: { "x-apify-signature": sig },
      body: payload,
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ ingested: number }>();
    expect(body.ingested).toBe(1);
  });
});
