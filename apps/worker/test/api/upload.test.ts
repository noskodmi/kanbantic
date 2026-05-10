import { SELF, env } from "cloudflare:test";
import { type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bmtRoot, bytesToHex } from "@kanbantic/swarm-verified-fetch";

import { applyMigrations } from "../../src/db/migrate.js";

const NONCE_URL = "https://example.com/api/siwe/nonce";
const VERIFY_URL = "https://example.com/api/siwe/verify";
const UPLOAD_URL = "https://example.com/api/upload";

interface UploadResponse {
  ref: string;
  mode: "gateway" | "local";
  size: number;
}

function buildSiweMessage(args: { domain: string; address: Address; nonce: string }): string {
  const issuedAt = new Date().toISOString();
  return [
    `${args.domain} wants you to sign in with your Ethereum account:`,
    args.address,
    "",
    "Sign in to Kanbantic",
    "",
    `URI: https://kanbantic.app/login`,
    `Version: 1`,
    `Chain ID: 11155111`,
    `Nonce: ${args.nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

async function siweSignIn(): Promise<string> {
  const nonceRes = await SELF.fetch(NONCE_URL, { method: "POST" });
  const { nonce } = await nonceRes.json<{ nonce: string }>();
  const account = privateKeyToAccount(generatePrivateKey());
  const message = buildSiweMessage({
    domain: env.SIWE_DOMAIN ?? "kanbantic-api.lizzflix.workers.dev",
    address: account.address,
    nonce,
  });
  const signature = await account.signMessage({ message });
  const verifyRes = await SELF.fetch(VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  const { token } = await verifyRes.json<{ token: string }>();
  return token;
}

describe("POST /api/upload", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM siwe_nonces").run();
    await env.DB.prepare("DELETE FROM local_swarm_blobs").run();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 without a SIWE bearer token", async () => {
    const res = await SELF.fetch(UPLOAD_URL, {
      method: "POST",
      body: new Uint8Array([1, 2, 3]),
    });
    expect(res.status).toBe(401);
  });

  it("uploads via the gateway when the gateway accepts the bytes", async () => {
    const token = await siweSignIn();
    const payload = new TextEncoder().encode("hello kanbantic");
    const expectedRef = `0x${bytesToHex(bmtRoot(payload))}`;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request): Promise<Response> => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url === "https://api.gateway.ethswarm.org/bzz") {
          // Echo back the BMT ref the local hash produced — the upload
          // helper pins gateway success on a matching ref.
          return Promise.resolve(
            new Response(JSON.stringify({ reference: expectedRef.slice(2) }), {
              headers: { "content-type": "application/json" },
            }),
          );
        }
        throw new Error(`unexpected fetch in upload test: ${url}`);
      }),
    );

    const res = await SELF.fetch(UPLOAD_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: payload,
    });
    expect(res.status).toBe(200);
    const body = await res.json<UploadResponse>();
    expect(body.ref).toBe(expectedRef);
    expect(body.mode).toBe("gateway");
    expect(body.size).toBe(payload.length);
  });

  it("falls back to local-D1 mode when the gateway returns 503", async () => {
    const token = await siweSignIn();
    const payload = new TextEncoder().encode("local-fallback payload");
    const expectedRef = `0x${bytesToHex(bmtRoot(payload))}`;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request): Promise<Response> => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url === "https://api.gateway.ethswarm.org/bzz") {
          return Promise.resolve(new Response("rate limited", { status: 503 }));
        }
        throw new Error(`unexpected fetch in upload test: ${url}`);
      }),
    );

    const res = await SELF.fetch(UPLOAD_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: payload,
    });
    expect(res.status).toBe(200);
    const body = await res.json<UploadResponse>();
    expect(body.ref).toBe(expectedRef);
    expect(body.mode).toBe("local");

    // Reading the ref via /api/swarm/:ref returns the original bytes.
    const readRes = await SELF.fetch(`https://example.com/api/swarm/${expectedRef}`);
    expect(readRes.status).toBe(200);
    const readBytes = new Uint8Array(await readRes.arrayBuffer());
    expect(readBytes).toEqual(payload);
  });

  it("rejects payloads larger than one Swarm chunk with 413", async () => {
    const token = await siweSignIn();
    const huge = new Uint8Array(5000);
    const res = await SELF.fetch(UPLOAD_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: huge,
    });
    expect(res.status).toBe(413);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("payload_too_large");
  });

  it("returns 404 for unknown swarm refs", async () => {
    const res = await SELF.fetch(`https://example.com/api/swarm/0x${"00".repeat(32)}`);
    expect(res.status).toBe(404);
  });
});
