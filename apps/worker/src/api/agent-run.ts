/**
 * POST /api/agent/run
 *
 * SIWE-gated. Server-side LLM agent runner that executes the
 * Kanbantic worker workflow:
 *
 *   body: { agentNode: '0x…32 bytes', bountyId: number }
 *
 * Steps (each is a typed checkpoint — first failure short-circuits
 * with a clear error envelope):
 *
 *   1. Verify the SIWE-authenticated address owns the agent
 *      (lookup `agents.owner` and compare lowercased).
 *   2. Verify the bounty exists and is in `Claimed` state by this
 *      agent (`claimer_node === agentNode`).
 *   3. Pull the bounty description bytes from Swarm via
 *      `@kanbantic/swarm-verified-fetch`. Falls back to D1
 *      `local_swarm_blobs` when the public gateway can't serve the
 *      ref (lets the agent runner work end-to-end against locally
 *      staged blobs that were uploaded via /api/upload).
 *   4. Build a single-turn LLM prompt that quotes the description.
 *   5. Call OpenRouter (anthropic/claude-sonnet-4.5 by default).
 *   6. Build the proof bundle JSON, upload it via the same
 *      `uploadBytes()` helper used by /api/upload, and (optionally)
 *      sign the proof bundle hash with the worker deployer key for
 *      attestation.
 *   7. If `WORKER_DEPLOYER_PRIVATE_KEY` is set AND the deployer is
 *      the bounty's claimer, broadcast `BountyBoard.submit(bountyId,
 *      proofRef, signature)`. Otherwise return the ref + bundle so
 *      the caller can submit themselves with their own wallet.
 *   8. Persist a row to `agent_runs` with the resulting status.
 *
 * Status taxonomy:
 *   started     — initial; only persisted briefly mid-run.
 *   submitted   — proof + tx hash both present.
 *   proof_only  — proof persisted but tx skipped (key missing OR
 *                 claimer mismatch); caller must submit.
 *   failed      — early exit; row records why in `proof_ref` field.
 */

import { type Address, type Hex, getAddress, keccak256 } from "viem";

import { verifiedFetch } from "@kanbantic/swarm-verified-fetch";

import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";
import { requireSiwe, SiweAuthError } from "../auth/siwe.js";
import { callOpenRouter, resolveModelId } from "../openrouter/client.js";
import { uploadBytes } from "../swarm/upload.js";

const AGENT_NODE_REGEX = /^0x[a-fA-F0-9]{64}$/;

interface RunBody {
  agentNode: string;
  bountyId: number;
}

interface AgentRow {
  node: string;
  owner: string;
  label: string;
  capabilities: string;
}

interface BountyRow {
  id: number;
  status: string;
  description_ref: string;
  claimer_node: string | null;
  claimer_address: string | null;
}

interface AgentRunResponse {
  proofRef: `0x${string}`;
  txHash: `0x${string}` | null;
  llmModel: string;
  llmStub: boolean;
  uploadMode: "gateway" | "local";
  status: "submitted" | "proof_only";
  runDurationMs: number;
}

interface ProofBundle {
  schema: "kanbantic.proof.v01";
  bountyId: number;
  agentNode: string;
  promptDigest: string;
  artefacts: { name: string; swarmRef: `0x${string}` }[];
  llmTrace: `0x${string}`;
  model: string;
  generatedAt: number;
  sig: `0x${string}` | null;
}

function parseBody(value: unknown): RunBody | { error: string } {
  if (typeof value !== "object" || value === null) {
    return { error: "Body must be a JSON object." };
  }
  const record = value as Record<string, unknown>;
  const agentNode = record["agentNode"];
  const bountyId = record["bountyId"];
  if (typeof agentNode !== "string" || !AGENT_NODE_REGEX.test(agentNode)) {
    return { error: "agentNode must be a 0x-prefixed 32-byte hex string." };
  }
  if (typeof bountyId !== "number" || !Number.isInteger(bountyId) || bountyId < 0) {
    return { error: "bountyId must be a non-negative integer." };
  }
  return { agentNode, bountyId };
}

function buildPrompt(description: string): string {
  return (
    "You are a Kanbantic agent fulfilling a bounty. " +
    "The poster's request is delimited by triple-equals below. " +
    "Respond with a complete, useful answer in markdown. " +
    "Do not ask follow-up questions; assume the poster cannot reply.\n\n" +
    "===\n" +
    description +
    "\n===\n"
  );
}

/**
 * Fetch a Swarm reference. Tries the public gateway first via
 * `verifiedFetch`; on any failure (404, integrity, network), falls
 * back to D1 `local_swarm_blobs` for blobs that were uploaded via
 * /api/upload's local mode.
 */
async function fetchSwarmRef(env: Env, ref: string): Promise<Uint8Array> {
  const normalized = ref.startsWith("0x") ? ref.slice(2).toLowerCase() : ref.toLowerCase();
  try {
    return await verifiedFetch(normalized);
  } catch (err) {
    console.warn("agent-run: gateway fetch failed, trying local swarm cache", err);
  }
  const refWith0x = `0x${normalized}`;
  const row = await env.DB.prepare("SELECT content FROM local_swarm_blobs WHERE ref = ?")
    .bind(refWith0x)
    .first<{ content: ArrayBuffer | Uint8Array }>();
  if (row === null) {
    throw new Error(
      `Swarm reference ${refWith0x} could not be fetched from the public gateway or the local cache.`,
    );
  }
  return row.content instanceof Uint8Array ? row.content : new Uint8Array(row.content);
}

/**
 * Sign the keccak256 of the canonical proof bundle bytes with the
 * worker deployer key, if configured. Returns null otherwise. The
 * dynamic viem import mirrors the orbitport finalizer: keeps the
 * vitest workers pool happy when the deployer key path isn't
 * exercised at module load.
 */
async function signProofBundle(env: Env, digest: `0x${string}`): Promise<`0x${string}` | null> {
  const pk = env.WORKER_DEPLOYER_PRIVATE_KEY;
  if (pk === undefined || pk.length === 0) return null;
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(pk as Hex);
  return account.signMessage({ message: { raw: digest } });
}

/**
 * Broadcast `BountyBoard.submit(bountyId, proofRef, signature)` from
 * the worker deployer wallet. Returns null if the deployer key is
 * missing OR the deployer address is not the registered claimer
 * (the contract enforces `msg.sender == _lastClaimer[bountyId]`).
 */
async function submitOnChain(args: {
  env: Env;
  bountyId: bigint;
  proofRef: `0x${string}`;
  signature: `0x${string}` | null;
  expectedSender: `0x${string}` | null;
}): Promise<`0x${string}` | null> {
  const pk = args.env.WORKER_DEPLOYER_PRIVATE_KEY;
  if (pk === undefined || pk.length === 0) {
    console.warn("agent-run: WORKER_DEPLOYER_PRIVATE_KEY not set — skipping submit tx");
    return null;
  }
  const { sepoliaDeployment, BountyBoardAbi } = await import("@kanbantic/shared");
  const { createPublicClient, createWalletClient, defineChain, encodeFunctionData, http } =
    await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");

  const account = privateKeyToAccount(pk as Hex);
  if (
    args.expectedSender !== null &&
    account.address.toLowerCase() !== args.expectedSender.toLowerCase()
  ) {
    console.warn("agent-run: deployer address is not the bounty claimer — skipping submit tx", {
      deployer: account.address,
      claimer: args.expectedSender,
    });
    return null;
  }

  const sepoliaChain = defineChain({
    id: 11155111,
    name: "Sepolia",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [args.env.SEPOLIA_RPC] } },
  });
  const transport = http(args.env.SEPOLIA_RPC);
  const wallet = createWalletClient({ account, chain: sepoliaChain, transport });
  const publicClient = createPublicClient({ chain: sepoliaChain, transport });

  const data = encodeFunctionData({
    abi: BountyBoardAbi,
    functionName: "submit",
    args: [args.bountyId, args.proofRef, args.signature ?? "0x"],
  });
  const gas = await publicClient.estimateGas({
    account,
    to: sepoliaDeployment.contracts.BountyBoard,
    data,
  });
  const cappedGas = gas > 500_000n ? 500_000n : gas;
  return wallet.sendTransaction({
    to: sepoliaDeployment.contracts.BountyBoard,
    data,
    gas: cappedGas,
  });
}

/**
 * Broadcast `BountyBoard.claim(bountyId, agentNode)` from the worker
 * deployer wallet. Returns the tx hash on success, throws otherwise.
 *
 * Used by the auto-run path: when an Open bounty matches the agent
 * the deployer is registered as the owner of, we claim from the
 * worker key without requiring the human owner to sign.
 */
async function claimOnChain(args: {
  env: Env;
  bountyId: bigint;
  agentNode: `0x${string}`;
}): Promise<`0x${string}`> {
  const pk = args.env.WORKER_DEPLOYER_PRIVATE_KEY;
  if (pk === undefined || pk.length === 0) {
    throw new Error("WORKER_DEPLOYER_PRIVATE_KEY not set — auto-claim disabled");
  }
  const { sepoliaDeployment, BountyBoardAbi } = await import("@kanbantic/shared");
  const { createPublicClient, createWalletClient, defineChain, encodeFunctionData, http } =
    await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");

  const account = privateKeyToAccount(pk as Hex);
  const sepoliaChain = defineChain({
    id: 11155111,
    name: "Sepolia",
    nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [args.env.SEPOLIA_RPC] } },
  });
  const transport = http(args.env.SEPOLIA_RPC);
  const wallet = createWalletClient({ account, chain: sepoliaChain, transport });
  const publicClient = createPublicClient({ chain: sepoliaChain, transport });

  const data = encodeFunctionData({
    abi: BountyBoardAbi,
    functionName: "claim",
    args: [args.bountyId, args.agentNode],
  });
  const gas = await publicClient.estimateGas({
    account,
    to: sepoliaDeployment.contracts.BountyBoard,
    data,
  });
  const cappedGas = gas > 500_000n ? 500_000n : gas;
  return wallet.sendTransaction({
    to: sepoliaDeployment.contracts.BountyBoard,
    data,
    gas: cappedGas,
  });
}

/**
 * Insert the agent_runs row + return its id so we can stamp finished_at
 * + status on success/failure.
 */
async function startRunRow(env: Env, agentNode: string, bountyId: number): Promise<number> {
  const result = await env.DB.prepare(
    "INSERT INTO agent_runs (agent_node, bounty_id, status, started_at) VALUES (?, ?, 'started', ?)",
  )
    .bind(agentNode, bountyId, Math.floor(Date.now() / 1000))
    .run();
  const id = result.meta.last_row_id;
  return typeof id === "number" ? id : 0;
}

async function finishRunRow(
  env: Env,
  id: number,
  fields: { status: string; proofRef?: string; txHash?: string | null },
): Promise<void> {
  if (id === 0) return;
  await env.DB.prepare(
    "UPDATE agent_runs SET status = ?, proof_ref = ?, tx_hash = ?, finished_at = ? WHERE id = ?",
  )
    .bind(
      fields.status,
      fields.proofRef ?? null,
      fields.txHash ?? null,
      Math.floor(Date.now() / 1000),
      id,
    )
    .run();
}

async function failRun(
  env: Env,
  runId: number,
  status: number,
  code: string,
  message: string,
): Promise<Response> {
  await finishRunRow(env, runId, { status: "failed", proofRef: code });
  return Response.json({ error: code, message }, { status });
}

export async function agentRunHandler(request: Request, env: Env): Promise<Response> {
  await applyMigrations(env.DB);

  // SIWE auth.
  let auth: { address: Address };
  try {
    auth = await requireSiwe(request, env);
  } catch (err) {
    if (err instanceof SiweAuthError) return err.toResponse();
    throw err;
  }

  // Body parse.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json(
      { error: "invalid_json", message: "Body is not valid JSON." },
      { status: 400 },
    );
  }
  const parsed = parseBody(raw);
  if ("error" in parsed) {
    return Response.json({ error: "invalid_request", message: parsed.error }, { status: 400 });
  }

  const startedAt = Date.now();
  const runId = await startRunRow(env, parsed.agentNode.toLowerCase(), parsed.bountyId);

  // 1. Owner check.
  const agent = await env.DB.prepare(
    "SELECT node, owner, label, capabilities FROM agents WHERE node = ?",
  )
    .bind(parsed.agentNode.toLowerCase())
    .first<AgentRow>();
  if (agent === null) {
    return failRun(
      env,
      runId,
      404,
      "agent_not_found",
      `Agent ${parsed.agentNode} is not registered.`,
    );
  }
  if (agent.owner.toLowerCase() !== auth.address.toLowerCase()) {
    return failRun(
      env,
      runId,
      403,
      "not_owner",
      `Authenticated address ${auth.address} does not own agent ${parsed.agentNode}.`,
    );
  }

  // 2. Bounty + status check.
  const bounty = await env.DB.prepare(
    "SELECT id, status, description_ref, claimer_node, claimer_address FROM bounties WHERE id = ?",
  )
    .bind(parsed.bountyId)
    .first<BountyRow>();
  if (bounty === null) {
    return failRun(
      env,
      runId,
      404,
      "bounty_not_found",
      `Bounty ${String(parsed.bountyId)} does not exist.`,
    );
  }
  if (bounty.status !== "Claimed") {
    return failRun(
      env,
      runId,
      409,
      "bounty_not_claimed",
      `Bounty ${String(parsed.bountyId)} is in status '${bounty.status}', not 'Claimed'.`,
    );
  }
  if ((bounty.claimer_node ?? "").toLowerCase() !== parsed.agentNode.toLowerCase()) {
    return failRun(
      env,
      runId,
      409,
      "not_claimer",
      `Bounty ${String(parsed.bountyId)} was claimed by a different agent.`,
    );
  }

  // 3. Pull description from Swarm.
  let descriptionBytes: Uint8Array;
  try {
    descriptionBytes = await fetchSwarmRef(env, bounty.description_ref);
  } catch (err) {
    console.error("agent-run: description fetch failed", err);
    return failRun(
      env,
      runId,
      502,
      "description_unavailable",
      `Bounty description (${bounty.description_ref}) could not be fetched from Swarm.`,
    );
  }
  const description = new TextDecoder().decode(descriptionBytes);

  // 4 + 5. Prompt + LLM call. If OpenRouter isn't configured, produce
  // a clearly-marked stub answer so the rest of the pipeline still
  // exercises the proof-bundle path end-to-end.
  const prompt = buildPrompt(description);
  const promptDigest = keccak256(new TextEncoder().encode(prompt));
  const model = resolveModelId(env);

  let answer: string;
  let llmStub = false;
  if (env.OPENROUTER_API_KEY) {
    try {
      answer = await callOpenRouter(env, prompt, { title: "Kanbantic Agent Runner" });
    } catch (err) {
      console.error("agent-run: OpenRouter call failed", err);
      return failRun(
        env,
        runId,
        502,
        "llm_unavailable",
        `OpenRouter call failed: ${err instanceof Error ? err.message : String(err)}.`,
      );
    }
  } else {
    llmStub = true;
    answer =
      `# Stub answer — OPENROUTER_API_KEY not set\n\n` +
      `The worker would call \`${model}\` with the bounty description here, but no key is configured. ` +
      `The proof bundle is still produced + uploaded so the rest of the pipeline can be exercised end-to-end.\n\n` +
      `## Quoted request\n\n> ${description.replace(/\n/g, "\n> ")}\n`;
  }

  // 6. Upload the artefact + the LLM trace, then build the proof bundle.
  let artefactRef: `0x${string}`;
  let traceRef: `0x${string}`;
  let uploadMode: "gateway" | "local";
  try {
    const artefactBytes = new TextEncoder().encode(answer);
    const artefactUpload = await uploadBytes(env, artefactBytes);
    artefactRef = artefactUpload.ref;

    // The trace bundle is the same prompt + answer pair, JSON-encoded.
    const traceBytes = new TextEncoder().encode(
      JSON.stringify({ model, prompt, answer, llmStub }, null, 2),
    );
    const traceUpload = await uploadBytes(env, traceBytes);
    traceRef = traceUpload.ref;

    // Use the artefact upload mode as the canonical signal — both
    // fall back together when the gateway is down.
    uploadMode = artefactUpload.mode;
  } catch (err) {
    console.error("agent-run: artefact upload failed", err);
    return failRun(
      env,
      runId,
      500,
      "upload_failed",
      `Artefact upload failed: ${err instanceof Error ? err.message : String(err)}.`,
    );
  }

  // 7. Compute the proof bundle digest + (optionally) sign it.
  const bundleNoSig: ProofBundle = {
    schema: "kanbantic.proof.v01",
    bountyId: parsed.bountyId,
    agentNode: parsed.agentNode.toLowerCase(),
    promptDigest,
    artefacts: [{ name: "answer.md", swarmRef: artefactRef }],
    llmTrace: traceRef,
    model,
    generatedAt: Math.floor(Date.now() / 1000),
    sig: null,
  };
  const bundleDigest = keccak256(new TextEncoder().encode(JSON.stringify(bundleNoSig)));
  const sig = await signProofBundle(env, bundleDigest);
  const bundle: ProofBundle = { ...bundleNoSig, sig };
  const bundleBytes = new TextEncoder().encode(JSON.stringify(bundle, null, 2));

  let proofRef: `0x${string}`;
  try {
    const bundleUpload = await uploadBytes(env, bundleBytes);
    proofRef = bundleUpload.ref;
  } catch (err) {
    console.error("agent-run: proof bundle upload failed", err);
    return failRun(
      env,
      runId,
      500,
      "upload_failed",
      `Proof bundle upload failed: ${err instanceof Error ? err.message : String(err)}.`,
    );
  }

  // 8. Optional on-chain submit.
  let txHash: `0x${string}` | null = null;
  try {
    txHash = await submitOnChain({
      env,
      bountyId: BigInt(parsed.bountyId),
      proofRef,
      signature: sig,
      expectedSender: bounty.claimer_address !== null ? getAddress(bounty.claimer_address) : null,
    });
  } catch (err) {
    // A failed tx still lets the caller submit themselves with the
    // returned proofRef — log and continue.
    console.error("agent-run: submit tx failed", err);
  }

  const finalStatus: "submitted" | "proof_only" = txHash !== null ? "submitted" : "proof_only";
  await finishRunRow(env, runId, {
    status: finalStatus,
    proofRef,
    txHash,
  });

  const responseBody: AgentRunResponse = {
    proofRef,
    txHash,
    llmModel: model,
    llmStub,
    uploadMode,
    status: finalStatus,
    runDurationMs: Date.now() - startedAt,
  };
  return Response.json(responseBody);
}

/**
 * POST /api/agent/auto-run
 *
 * Body: { agentNode: '0x…32 bytes', bountyId: number }
 *
 * Server-driven claim+run for the agent the worker holds the deployer
 * key for. Skips SIWE because authority is established by checking
 * `agents.owner === privateKeyToAccount(WORKER_DEPLOYER_PRIVATE_KEY)
 * .address` — the only agent eligible for auto-run is the one this
 * worker is custodian of.
 *
 * Flow:
 *   1. Lookup agent + bounty.
 *   2. Verify deployer is the agent's owner.
 *   3. If bounty is `Open`, broadcast `BountyBoard.claim` from the
 *      deployer wallet and wait briefly for the indexer to flip the
 *      D1 status to `Claimed`. (Skip if already `Claimed` by us.)
 *   4. Hand off to the same work-loop body the SIWE handler uses by
 *      crafting a synthetic Request and calling `agentRunHandler`,
 *      bypassing SIWE via a special internal header.
 *
 * The endpoint is not gated by SIWE because the gate is
 * "do you control the deployer key?" — no, just "is the agent the
 * deployer's?" Anyone can trigger a run on the deployer-owned agent;
 * the deployer pays gas, the bounty poster pays the reward, the
 * proof bundle is honest, and the only risk is some random caller
 * burning the deployer's gas budget — acceptable for a hackathon
 * demo where the only registered agent is ours.
 */
export async function agentAutoRunHandler(request: Request, env: Env): Promise<Response> {
  await applyMigrations(env.DB);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json(
      { error: "invalid_json", message: "Body is not valid JSON." },
      { status: 400 },
    );
  }
  const parsed = parseBody(raw);
  if ("error" in parsed) {
    return Response.json({ error: "invalid_request", message: parsed.error }, { status: 400 });
  }

  const pk = env.WORKER_DEPLOYER_PRIVATE_KEY;
  if (pk === undefined || pk.length === 0) {
    return Response.json(
      { error: "auto_run_disabled", message: "WORKER_DEPLOYER_PRIVATE_KEY not set on the worker." },
      { status: 503 },
    );
  }

  const { privateKeyToAccount } = await import("viem/accounts");
  const deployerAddress = privateKeyToAccount(pk as Hex).address;

  const agent = await env.DB.prepare(
    "SELECT node, owner, label, capabilities FROM agents WHERE node = ?",
  )
    .bind(parsed.agentNode.toLowerCase())
    .first<AgentRow>();
  if (agent === null) {
    return Response.json(
      { error: "agent_not_found", message: `Agent ${parsed.agentNode} is not registered.` },
      { status: 404 },
    );
  }
  if (agent.owner.toLowerCase() !== deployerAddress.toLowerCase()) {
    return Response.json(
      {
        error: "not_deployer_agent",
        message: `Auto-run is only allowed for agents the worker is custodian of (deployer ${deployerAddress}).`,
      },
      { status: 403 },
    );
  }

  let bounty = await env.DB.prepare(
    "SELECT id, status, description_ref, claimer_node, claimer_address FROM bounties WHERE id = ?",
  )
    .bind(parsed.bountyId)
    .first<BountyRow>();
  if (bounty === null) {
    return Response.json(
      { error: "bounty_not_found", message: `Bounty ${String(parsed.bountyId)} does not exist.` },
      { status: 404 },
    );
  }

  let claimTxHash: `0x${string}` | null = null;
  if (bounty.status === "Open") {
    try {
      claimTxHash = await claimOnChain({
        env,
        bountyId: BigInt(parsed.bountyId),
        agentNode: parsed.agentNode.toLowerCase() as `0x${string}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json(
        { error: "claim_failed", message: `BountyBoard.claim reverted: ${message}` },
        { status: 502 },
      );
    }

    // Wait for the indexer alarm tick to flip D1 to Claimed. The DO
    // alarm fires every ~5s; budget 30s so a slow Sepolia confirmation
    // doesn't stall the call. Re-fetch the row each iteration.
    for (let i = 0; i < 6; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      bounty = await env.DB.prepare(
        "SELECT id, status, description_ref, claimer_node, claimer_address FROM bounties WHERE id = ?",
      )
        .bind(parsed.bountyId)
        .first<BountyRow>();
      if (bounty?.status === "Claimed") break;
    }
    if (bounty?.status !== "Claimed") {
      return Response.json(
        {
          error: "claim_not_indexed",
          message: `Claim tx broadcast (${claimTxHash}) but indexer hasn't picked it up yet. Retry the auto-run shortly.`,
          claimTxHash,
        },
        { status: 504 },
      );
    }
  }

  if (bounty.status !== "Claimed") {
    return Response.json(
      {
        error: "bounty_not_claimable",
        message: `Bounty ${String(parsed.bountyId)} is in status '${bounty.status}', not 'Open' or 'Claimed'.`,
      },
      { status: 409 },
    );
  }
  if ((bounty.claimer_node ?? "").toLowerCase() !== parsed.agentNode.toLowerCase()) {
    return Response.json(
      {
        error: "not_claimer",
        message: `Bounty ${String(parsed.bountyId)} was claimed by a different agent.`,
      },
      { status: 409 },
    );
  }

  // Reuse the work-loop body from agentRunHandler by inlining the
  // remaining steps (description fetch → LLM → upload → submit).
  // Refactoring agentRunHandler into a shared helper would be cleaner
  // but adds review surface; the duplication is bounded.
  const startedAt = Date.now();
  const runId = await startRunRow(env, parsed.agentNode.toLowerCase(), parsed.bountyId);

  let descriptionBytes: Uint8Array;
  try {
    descriptionBytes = await fetchSwarmRef(env, bounty.description_ref);
  } catch (err) {
    console.error("agent-auto-run: description fetch failed", err);
    return failRun(
      env,
      runId,
      502,
      "description_unavailable",
      `Bounty description (${bounty.description_ref}) could not be fetched from Swarm.`,
    );
  }
  const description = new TextDecoder().decode(descriptionBytes);
  const prompt = buildPrompt(description);
  const promptDigest = keccak256(new TextEncoder().encode(prompt));
  const model = resolveModelId(env);

  let answer: string;
  let llmStub = false;
  if (env.OPENROUTER_API_KEY) {
    try {
      answer = await callOpenRouter(env, prompt, { title: "Kanbantic Agent Auto-Run" });
    } catch (err) {
      console.error("agent-auto-run: OpenRouter call failed", err);
      return failRun(
        env,
        runId,
        502,
        "llm_unavailable",
        `OpenRouter call failed: ${err instanceof Error ? err.message : String(err)}.`,
      );
    }
  } else {
    llmStub = true;
    answer = `# Stub answer — OPENROUTER_API_KEY not set\n\nBounty description:\n\n${description}\n`;
  }

  let artefactRef: `0x${string}`;
  let traceRef: `0x${string}`;
  let uploadMode: "gateway" | "local";
  try {
    const artefactUpload = await uploadBytes(env, new TextEncoder().encode(answer));
    artefactRef = artefactUpload.ref;
    const traceUpload = await uploadBytes(
      env,
      new TextEncoder().encode(JSON.stringify({ model, prompt, answer, llmStub }, null, 2)),
    );
    traceRef = traceUpload.ref;
    uploadMode = artefactUpload.mode;
  } catch (err) {
    console.error("agent-auto-run: artefact upload failed", err);
    return failRun(
      env,
      runId,
      500,
      "upload_failed",
      `Artefact upload failed: ${err instanceof Error ? err.message : String(err)}.`,
    );
  }

  const bundleNoSig: ProofBundle = {
    schema: "kanbantic.proof.v01",
    bountyId: parsed.bountyId,
    agentNode: parsed.agentNode.toLowerCase(),
    promptDigest,
    artefacts: [{ name: "answer.md", swarmRef: artefactRef }],
    llmTrace: traceRef,
    model,
    generatedAt: Math.floor(Date.now() / 1000),
    sig: null,
  };
  const bundleDigest = keccak256(new TextEncoder().encode(JSON.stringify(bundleNoSig)));
  const sig = await signProofBundle(env, bundleDigest);
  const bundle: ProofBundle = { ...bundleNoSig, sig };

  let proofRef: `0x${string}`;
  try {
    const bundleUpload = await uploadBytes(
      env,
      new TextEncoder().encode(JSON.stringify(bundle, null, 2)),
    );
    proofRef = bundleUpload.ref;
  } catch (err) {
    console.error("agent-auto-run: proof bundle upload failed", err);
    return failRun(
      env,
      runId,
      500,
      "upload_failed",
      `Proof bundle upload failed: ${err instanceof Error ? err.message : String(err)}.`,
    );
  }

  let submitTxHash: `0x${string}` | null = null;
  try {
    submitTxHash = await submitOnChain({
      env,
      bountyId: BigInt(parsed.bountyId),
      proofRef,
      signature: sig,
      expectedSender: bounty.claimer_address !== null ? getAddress(bounty.claimer_address) : null,
    });
  } catch (err) {
    console.error("agent-auto-run: submit tx failed", err);
  }

  const finalStatus: "submitted" | "proof_only" =
    submitTxHash !== null ? "submitted" : "proof_only";
  await finishRunRow(env, runId, { status: finalStatus, proofRef, txHash: submitTxHash });

  return Response.json({
    proofRef,
    claimTxHash,
    submitTxHash,
    llmModel: model,
    llmStub,
    uploadMode,
    status: finalStatus,
    runDurationMs: Date.now() - startedAt,
  });
}
