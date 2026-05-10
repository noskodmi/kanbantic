/**
 * Minimal MCP (Model Context Protocol) JSON-RPC server.
 *
 * Exposes the indexer's read API as MCP tools so any agent runner can
 * discover Kanbantic + query agents/bounties without a custom client.
 *
 * Wire protocol: JSON-RPC 2.0 over a single POST endpoint
 * (`/mcp` and `/api/mcp` both routed). Implements the three core methods
 * needed for "Try the MCP" smoke tests:
 *   - `initialize`         — handshake (returns server name + version)
 *   - `tools/list`         — enumerate available tools
 *   - `tools/call`         — invoke a tool by name
 *
 * Phase 7 v0.1 — read-only. Future: write tools (post bounty, accept,
 * attest) once SIWE auth lands on the worker.
 */

import { sepoliaDeployment } from "@kanbantic/shared";

import type { Env } from "../env.js";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "kanbantic-mcp";
const SERVER_VERSION = "0.1.0";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params?: unknown;
}

function rpcResult(id: JsonRpcRequest["id"], result: unknown): Response {
  return Response.json(
    { jsonrpc: "2.0", id, result },
    { headers: { "access-control-allow-origin": "*" } },
  );
}

function rpcError(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  data?: unknown,
): Response {
  return Response.json(
    { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } },
    { headers: { "access-control-allow-origin": "*" } },
  );
}

const TOOLS = [
  {
    name: "list_agents",
    description:
      "List indexed agents under kanbantic.eth. Returns label, owner, MCP endpoint, capabilities, and reputation.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Max rows (default 50)" },
      },
    },
  },
  {
    name: "list_bounties",
    description:
      "List indexed bounties on BountyBoard. Returns id, capability, reward (wei), status, claimer, and timestamps.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 200, description: "Max rows (default 50)" },
      },
    },
  },
  {
    name: "get_status",
    description:
      "Indexer status: chain id, last indexed block, deployed contract addresses, ENS root.",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

async function readWorkerJson(env: Env, path: string): Promise<unknown> {
  // Internal call: hit our own host. Cloudflare Workers don't allow
  // self-fetch via the public hostname inside the same isolate; instead,
  // call the handler directly via the bound D1.
  // Simpler: query D1 ourselves for the same shape the public endpoint emits.
  if (path === "/api/agents") {
    const result = await env.DB.prepare(
      `SELECT a.node, a.parent, a.owner, a.label, a.mcp_endpoint, a.capabilities, a.profile_ref,
              a.registered_at_block, a.registered_at_ts,
              COALESCE(r.score, 0) AS reputation_score,
              COALESCE(r.attestation_count, 0) AS reputation_count
         FROM agents a
         LEFT JOIN agent_reputation r ON r.node = a.node
         ORDER BY a.registered_at_block DESC
         LIMIT 50`,
    ).all();
    return { agents: result.results, limit: 50 };
  }
  if (path === "/api/work") {
    const result = await env.DB.prepare(
      `SELECT id, poster, capability, reward, description_ref, expires_at,
              claim_window_blocks, claim_window_start_block, status,
              claimer_node, claimer_address, workspace_node, arbiter_council,
              created_at_block, created_at_ts, resolved_at_block
         FROM bounties
         ORDER BY created_at_block DESC
         LIMIT 50`,
    ).all();
    return { bounties: result.results, limit: 50 };
  }
  if (path === "/api/status") {
    const row = await env.DB.prepare("SELECT last_block FROM index_cursor WHERE chain_id = ?")
      .bind(Number(env.SEPOLIA_CHAIN_ID))
      .first<{ last_block: number }>();
    return {
      chainId: Number(env.SEPOLIA_CHAIN_ID),
      lastBlock: row?.last_block ?? 0,
      contracts: sepoliaDeployment.contracts,
      ens: sepoliaDeployment.ens,
    };
  }
  return null;
}

async function callTool(env: Env, name: string, _args: unknown): Promise<unknown> {
  if (name === "list_agents") return readWorkerJson(env, "/api/agents");
  if (name === "list_bounties") return readWorkerJson(env, "/api/work");
  if (name === "get_status") return readWorkerJson(env, "/api/status");
  throw new Error(`unknown tool: ${name}`);
}

export async function mcpHandler(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "content-type",
      },
    });
  }

  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { id, method, params } = body;

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
    });
  }

  if (method === "tools/list") {
    return rpcResult(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const p = (params ?? {}) as { name?: string; arguments?: unknown };
    if (typeof p.name !== "string") {
      return rpcError(id, -32602, "Invalid params: missing tool name");
    }
    try {
      const result = await callTool(env, p.name, p.arguments);
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    } catch (err) {
      return rpcError(id, -32000, err instanceof Error ? err.message : "tool error");
    }
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}
