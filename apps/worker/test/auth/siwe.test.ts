import { SELF, env } from "cloudflare:test";
import { type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../src/db/migrate.js";
import { requireSiwe, SiweAuthError } from "../../src/auth/siwe.js";

const NONCE_URL = "https://example.com/api/siwe/nonce";
const VERIFY_URL = "https://example.com/api/siwe/verify";

interface NonceResponse {
  nonce: string;
}

interface VerifyResponse {
  token: string;
  address: Address;
  expiresAt: number;
}

function buildSiweMessage(args: {
  domain: string;
  address: Address;
  nonce: string;
  uri: string;
  chainId: number;
}): string {
  const issuedAt = new Date().toISOString();
  return [
    `${args.domain} wants you to sign in with your Ethereum account:`,
    args.address,
    "",
    "Sign in to Kanbantic",
    "",
    `URI: ${args.uri}`,
    `Version: 1`,
    `Chain ID: ${args.chainId.toString()}`,
    `Nonce: ${args.nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

describe("SIWE auth", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM siwe_nonces").run();
  });

  it("issues nonces and verifies a viem-signed message", async () => {
    // 1. Pull a nonce.
    const nonceRes = await SELF.fetch(NONCE_URL, { method: "POST" });
    expect(nonceRes.status).toBe(200);
    const { nonce } = await nonceRes.json<NonceResponse>();
    expect(typeof nonce).toBe("string");
    expect(nonce.length).toBeGreaterThan(8);

    // 2. Sign an EIP-4361 message with a fresh wallet.
    const account = privateKeyToAccount(generatePrivateKey());
    const message = buildSiweMessage({
      domain: env.SIWE_DOMAIN ?? "kanbantic-api.lizzflix.workers.dev",
      address: account.address,
      nonce,
      uri: "https://kanbantic.app/login",
      chainId: 11155111,
    });
    const signature = await account.signMessage({ message });

    // 3. POST verify.
    const verifyRes = await SELF.fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json<VerifyResponse>();
    expect(verifyBody.token.split(".")).toHaveLength(3);
    expect(verifyBody.address.toLowerCase()).toBe(account.address.toLowerCase());
    expect(verifyBody.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));

    // 4. requireSiwe should accept the token via Authorization header.
    const authedReq = new Request("https://example.com/api/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${verifyBody.token}` },
    });
    const auth = await requireSiwe(authedReq, env);
    expect(auth.address.toLowerCase()).toBe(account.address.toLowerCase());

    // 5. Nonce is now used — replay must fail.
    const replayRes = await SELF.fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    expect(replayRes.status).toBe(400);
    const replayBody = await replayRes.json<{ error: string }>();
    expect(replayBody.error).toBe("nonce_used");
  });

  it("rejects messages whose domain does not match SIWE_DOMAIN", async () => {
    const nonceRes = await SELF.fetch(NONCE_URL, { method: "POST" });
    const { nonce } = await nonceRes.json<NonceResponse>();
    const account = privateKeyToAccount(generatePrivateKey());
    const message = buildSiweMessage({
      domain: "evil.example.com",
      address: account.address,
      nonce,
      uri: "https://evil.example.com/login",
      chainId: 11155111,
    });
    const signature = await account.signMessage({ message });
    const res = await SELF.fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("wrong_domain");
  });

  it("requireSiwe rejects missing auth header", async () => {
    const req = new Request("https://example.com/api/upload", { method: "POST" });
    await expect(requireSiwe(req, env)).rejects.toBeInstanceOf(SiweAuthError);
  });

  it("requireSiwe rejects a tampered token", async () => {
    // Issue a valid token first.
    const nonceRes = await SELF.fetch(NONCE_URL, { method: "POST" });
    const { nonce } = await nonceRes.json<NonceResponse>();
    const account = privateKeyToAccount(generatePrivateKey());
    const message = buildSiweMessage({
      domain: env.SIWE_DOMAIN ?? "kanbantic-api.lizzflix.workers.dev",
      address: account.address,
      nonce,
      uri: "https://kanbantic.app/login",
      chainId: 11155111,
    });
    const signature = await account.signMessage({ message });
    const verifyRes = await SELF.fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    const { token } = await verifyRes.json<VerifyResponse>();

    // Flip the last byte of the signature segment.
    const parts = token.split(".");
    const sigPart = parts[2] ?? "";
    const tamperedSig = `${sigPart.slice(0, -1)}${sigPart.endsWith("A") ? "B" : "A"}`;
    const tampered = `${parts[0] ?? ""}.${parts[1] ?? ""}.${tamperedSig}`;
    const req = new Request("https://example.com/api/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${tampered}` },
    });
    await expect(requireSiwe(req, env)).rejects.toMatchObject({ code: "invalid_token" });
  });
});
