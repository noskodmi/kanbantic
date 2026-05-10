import { type Address, parseEther } from "viem";

import { agentsHandler } from "./api/agents.js";
import { ccipReadHandler } from "./api/ccip-read.js";
import { contractIntelligenceHandler } from "./api/contract-intelligence.js";
import { mcpHandler } from "./api/mcp.js";
import { orbitportLastDrawHandler } from "./api/orbitport.js";
import { refreshHandler } from "./api/refresh.js";
import { statusHandler } from "./api/status.js";
import { workHandler } from "./api/work.js";
import type { Env } from "./env.js";
import { Router } from "./router.js";
import { withX402 } from "./x402/middleware.js";

/**
 * Default pay-to address for the X402 paywall when `X402_PAY_TO_ADDRESS`
 * isn't set in env. The Phase 1A deployer (and current operator) of the
 * Sepolia contracts. Production deploys override this via wrangler.jsonc
 * `vars` so receipts route to the live treasury rather than the dev
 * wallet.
 */
const DEFAULT_X402_PAY_TO: Address = "0x0000000000000000000000000000000000000000";
const X402_PRICE_WEI = parseEther("0.0001");

function payToFromEnv(env: Env): Address {
  const raw = env.X402_PAY_TO_ADDRESS?.trim();
  if (raw && /^0x[a-fA-F0-9]{40}$/.test(raw)) {
    return raw as Address;
  }
  return DEFAULT_X402_PAY_TO;
}

const paidContractIntelligenceHandler: (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
) => Promise<Response> = (request, env, ctx) => {
  const wrapped = withX402(contractIntelligenceHandler, {
    payTo: payToFromEnv(env),
    priceWei: X402_PRICE_WEI,
    network: "sepolia",
    endpoint: "/api/contract-intelligence/run",
  });
  return wrapped(request, env, ctx);
};

const router = new Router();
router.add({ method: "GET", path: "/api/status", handler: statusHandler });
router.add({ method: "GET", path: "/api/agents", handler: agentsHandler });
router.add({ method: "GET", path: "/api/work", handler: workHandler });
router.add({
  method: "GET",
  path: "/api/orbitport/last-draw",
  handler: orbitportLastDrawHandler,
});
router.add({ method: "POST", path: "/api/refresh", handler: refreshHandler });
router.add({
  method: "POST",
  path: "/api/contract-intelligence/run",
  handler: paidContractIntelligenceHandler,
});
// EIP-3668 CCIP-Read gateway. URL template `{sender}/{data}.json` is the
// pattern OffchainResolver pins at deploy time. Both GET (path-encoded)
// and POST (`{sender, data}` JSON body) are supported per spec.
router.add({ method: "GET", path: "/api/ccip-read/:sender/:data", handler: ccipReadHandler });
router.add({ method: "POST", path: "/api/ccip-read", handler: ccipReadHandler });
// MCP JSON-RPC server. /mcp is the canonical short path agents register;
// /api/mcp aliases it for REST-style consistency.
router.add({ method: "POST", path: "/mcp", handler: mcpHandler });
router.add({ method: "POST", path: "/api/mcp", handler: mcpHandler });
router.add({ method: "OPTIONS", path: "/mcp", handler: mcpHandler });
router.add({ method: "OPTIONS", path: "/api/mcp", handler: mcpHandler });

export default {
  async fetch(request, env, ctx) {
    return router.dispatch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

export { IndexerCursor } from "./indexer/cursor.js";
