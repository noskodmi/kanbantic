import type { D1Database, DurableObjectNamespace } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  INDEXER: DurableObjectNamespace;
  SEPOLIA_RPC: string;
  SEPOLIA_CHAIN_ID: string;
  INDEXER_CHUNK_BLOCKS: string;
  /** OpenRouter API key for the Contract Intelligence runner. Set via wrangler secret. */
  OPENROUTER_API_KEY?: string;
  /** OpenRouter model id (default: anthropic/claude-sonnet-4.5). */
  OPENROUTER_MODEL?: string;
  /**
   * Hex-encoded private key used by the CCIP-Read gateway to sign offchain
   * resolver responses. Provisioned via `wrangler secret put
   * CCIP_SIGNER_PRIVATE_KEY`. Optional — when unset, the gateway returns
   * 503 with setup instructions instead of crashing.
   */
  CCIP_SIGNER_PRIVATE_KEY?: string;
  /** Optional override for the CCIP response TTL window in seconds (default 300). */
  CCIP_RESPONSE_TTL_SECONDS?: string;
  /** Orbitport cTRNG endpoint. Required for the finalizer; tests that don't exercise it may omit. */
  ORBITPORT_URL?: string;
  /** Orbitport's pinned Ed25519 public key (32 bytes, hex, 0x-prefixed). */
  ORBITPORT_PUBKEY?: string;
  /** Optional bearer token if Orbitport requires auth. Set via wrangler secret. */
  ORBITPORT_TOKEN?: string;
  /**
   * Hex private key for the worker's deployer wallet. When set, Orbitport
   * finalizer submits `BountyBoard.finalizeFairClaim` directly. Unset
   * default: log draw + skip tx so judges can hand-fire via cast/etherscan.
   */
  WORKER_DEPLOYER_PRIVATE_KEY?: string;
  /**
   * Address that receives X402 payments for paywalled endpoints. When
   * unset (preview/dev) the worker falls back to the zero-address
   * sentinel — production must set this via wrangler vars/secrets.
   */
  X402_PAY_TO_ADDRESS?: string;
  /**
   * HMAC secret used to sign SIWE session tokens (Phase 2B-A write API).
   * Provisioned via `wrangler secret put SIWE_HMAC_SECRET`. When unset
   * the SIWE verify + write endpoints return 503 with setup
   * instructions instead of issuing/accepting unauthenticated tokens.
   */
  SIWE_HMAC_SECRET?: string;
  /**
   * Public origin the SIWE message must declare (and which the verify
   * endpoint pins). Defaults to the production worker URL when unset.
   */
  SIWE_DOMAIN?: string;
}
