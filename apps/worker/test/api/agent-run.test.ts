import { SELF, env } from "cloudflare:test";
import { type Address, keccak256, toBytes } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bmtRoot, bytesToHex } from "@kanbantic/swarm-verified-fetch";

import { applyMigrations } from "../../src/db/migrate.js";

const NONCE_URL = "https://example.com/api/siwe/nonce";
const VERIFY_URL = "https://example.com/api/siwe/verify";
const RUN_URL = "https://example.com/api/agent/run";

interface RunResponse {
  proofRef: string;
  txHash: string | null;
  llmModel: string;
  llmStub: boolean;
  uploadMode: "gateway" | "local";
  status: "submitted" | "proof_only";
  runDurationMs: number;
}

function buildSiweMessage(args: { domain: string; address: Address; nonce: string }): string {
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
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");
}

async function siweSignInAs(
  privateKey: `0x${string}`,
): Promise<{ token: string; address: Address }> {
  const nonceRes = await SELF.fetch(NONCE_URL, { method: "POST" });
  const { nonce } = await nonceRes.json<{ nonce: string }>();
  const account = privateKeyToAccount(privateKey);
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
  const body = await verifyRes.json<{ token: string }>();
  return { token: body.token, address: account.address };
}

async function seedAgent(node: string, owner: Address): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO agents (node, parent, owner, label, mcp_endpoint, capabilities, profile_ref, registered_at_block, registered_at_ts)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  )
    .bind(
      node.toLowerCase(),
      `0x${"22".repeat(32)}`,
      owner.toLowerCase(),
      "test-agent",
      "https://example.com/mcp",
      JSON.stringify(["explain"]),
      1,
      Math.floor(Date.now() / 1000),
    )
    .run();
}

async function seedBounty(args: {
  id: number;
  poster: string;
  descriptionRef: string;
  status: string;
  claimerNode: string | null;
  claimerAddress: string | null;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO bounties
       (id, poster, capability, reward, description_ref, expires_at, claim_window_blocks,
        claim_window_start_block, status, claimer_node, claimer_address, workspace_node,
        arbiter_council, created_at_block, created_at_ts)
     VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, 1, ?)`,
  )
    .bind(
      args.id,
      args.poster.toLowerCase(),
      "explain",
      "1000000000000000",
      args.descriptionRef.toLowerCase(),
      Math.floor(Date.now() / 1000) + 3600,
      args.status,
      args.claimerNode?.toLowerCase() ?? null,
      args.claimerAddress?.toLowerCase() ?? null,
      `0x${"44".repeat(32)}`,
      "0x0000000000000000000000000000000000000000",
      Math.floor(Date.now() / 1000),
    )
    .run();
}

const AGENT_NODE = `0x${"33".repeat(32)}`;
const BOUNTY_ID = 42;
const POSTER = "0xdEaD000000000000000000000000000000bEEf01";

describe("POST /api/agent/run", () => {
  beforeEach(async () => {
    await applyMigrations(env.DB);
    await env.DB.prepare("DELETE FROM siwe_nonces").run();
    await env.DB.prepare("DELETE FROM local_swarm_blobs").run();
    await env.DB.prepare("DELETE FROM agent_runs").run();
    await env.DB.prepare("DELETE FROM bounties").run();
    await env.DB.prepare("DELETE FROM agents").run();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 without SIWE auth", async () => {
    const res = await SELF.fetch(RUN_URL, {
      method: "POST",
      body: JSON.stringify({ agentNode: AGENT_NODE, bountyId: BOUNTY_ID }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects when caller is not the agent's owner", async () => {
    const { token } = await siweSignInAs(generatePrivateKey());
    await seedAgent(AGENT_NODE, "0x000000000000000000000000000000000000C0DE");
    const res = await SELF.fetch(RUN_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ agentNode: AGENT_NODE, bountyId: BOUNTY_ID }),
    });
    expect(res.status).toBe(403);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("not_owner");
  });

  it("rejects when the bounty is not Claimed by the agent", async () => {
    const pk = generatePrivateKey();
    const { token, address } = await siweSignInAs(pk);
    await seedAgent(AGENT_NODE, address);
    await seedBounty({
      id: BOUNTY_ID,
      poster: POSTER,
      descriptionRef: `0x${"55".repeat(32)}`,
      status: "Open",
      claimerNode: null,
      claimerAddress: null,
    });
    const res = await SELF.fetch(RUN_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ agentNode: AGENT_NODE, bountyId: BOUNTY_ID }),
    });
    expect(res.status).toBe(409);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("bounty_not_claimed");
  });

  it("runs end-to-end (stub LLM, mocked Swarm) and returns proof_only", async () => {
    const pk = generatePrivateKey();
    const { token, address } = await siweSignInAs(pk);
    await seedAgent(AGENT_NODE, address);

    // Stage the bounty description in the local swarm cache so the
    // agent runner's gateway-then-local fetch resolves without the
    // network. We compute the BMT root locally and write the row by
    // hand — same shape the upload helper uses.
    const description = "Write a haiku about content-addressed storage.";
    const descBytes = new TextEncoder().encode(description);
    const descRef = `0x${bytesToHex(bmtRoot(descBytes))}`;
    await env.DB.prepare("INSERT INTO local_swarm_blobs (ref, content, ts) VALUES (?, ?, ?)")
      .bind(descRef, descBytes, Math.floor(Date.now() / 1000))
      .run();

    await seedBounty({
      id: BOUNTY_ID,
      poster: POSTER,
      descriptionRef: descRef,
      status: "Claimed",
      claimerNode: AGENT_NODE,
      claimerAddress: address,
    });

    // Stub the network: the description fetch (404 → local fallback)
    // and the upload calls (503 → D1 fallback) are the only outbound
    // requests when OPENROUTER_API_KEY is unset.
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request): Promise<Response> => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.startsWith("https://api.gateway.ethswarm.org/bzz/")) {
          return Promise.resolve(new Response("not found", { status: 404 }));
        }
        if (url === "https://api.gateway.ethswarm.org/bzz") {
          return Promise.resolve(new Response("rate limited", { status: 503 }));
        }
        throw new Error(`unexpected fetch in agent-run test: ${url}`);
      }),
    );

    const res = await SELF.fetch(RUN_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ agentNode: AGENT_NODE, bountyId: BOUNTY_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<RunResponse>();
    expect(body.status).toBe("proof_only");
    expect(body.txHash).toBeNull();
    // OPENROUTER_API_KEY isn't configured in the test env — runner
    // produces a stub answer, still uploads + persists the bundle.
    expect(body.llmStub).toBe(true);
    expect(body.uploadMode).toBe("local");
    expect(body.proofRef).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.llmModel).toContain("claude");

    // The proof bundle row should be parseable JSON with the expected
    // schema + sig: null (no deployer key configured).
    const proofRow = await env.DB.prepare("SELECT content FROM local_swarm_blobs WHERE ref = ?")
      .bind(body.proofRef)
      .first<{ content: ArrayBuffer | Uint8Array }>();
    expect(proofRow).not.toBeNull();
    const proofBytes =
      proofRow?.content instanceof Uint8Array
        ? proofRow.content
        : new Uint8Array(proofRow?.content ?? new ArrayBuffer(0));
    const proof = JSON.parse(new TextDecoder().decode(proofBytes)) as {
      schema: string;
      bountyId: number;
      artefacts: { name: string; swarmRef: string }[];
      sig: string | null;
    };
    expect(proof.schema).toBe("kanbantic.proof.v01");
    expect(proof.bountyId).toBe(BOUNTY_ID);
    expect(proof.artefacts[0]?.name).toBe("answer.md");
    expect(proof.artefacts[0]?.swarmRef).toMatch(/^0x[0-9a-f]{64}$/);
    expect(proof.sig).toBeNull();

    // agent_runs row reflects the run.
    const runRow = await env.DB.prepare(
      "SELECT status, proof_ref, tx_hash FROM agent_runs WHERE bounty_id = ?",
    )
      .bind(BOUNTY_ID)
      .first<{ status: string; proof_ref: string; tx_hash: string | null }>();
    expect(runRow?.status).toBe("proof_only");
    expect(runRow?.proof_ref).toBe(body.proofRef);
    expect(runRow?.tx_hash).toBeNull();
    // Quiet unused-import warnings; these helpers are exercised
    // implicitly via the worker's keccak256/toBytes paths.
    void keccak256;
    void toBytes;
  });
});
