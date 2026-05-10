/**
 * @kanbantic/sourcify-client — typed wrapper around the Sourcify v2
 * server API.
 *
 * Endpoint:
 *   GET https://sourcify.dev/server/v2/contract/{chainId}/{address}?fields=all
 *
 * Sourcify v2 returns three match-status fields (`match`, `creationMatch`,
 * `runtimeMatch`) each of which is one of:
 *   - "exact_match" — bytecode + metadata both match
 *   - "match"       — bytecode matches but metadata doesn't (formerly
 *                     "partial_match" in v1 nomenclature)
 *   - null          — no match for that dimension
 *
 * For Contract Intelligence we collapse those to a single
 * `'exact_match' | 'partial_match' | 'none'` view because downstream
 * consumers (audit / explain prompts) only care that source is
 * trustworthy. We map v2's `"match"` → `"partial_match"` for
 * historical naming continuity with the v1 API the spec references.
 *
 * When a contract is unverified, Sourcify v2 returns 404 with all
 * match fields `null` — we surface that as `{ match: 'none' }`
 * rather than throwing.
 */

const SOURCIFY_V2_BASE = "https://sourcify.dev/server/v2/contract";

/**
 * Subset of the Sourcify metadata blob we care about. Sourcify returns
 * the full Solidity standard-JSON metadata, but Contract Intelligence
 * only consumes the compiler version + the source list.
 */
export interface SourcifyMetadata {
  compiler?: { version?: string };
  language?: string;
  sources?: Record<string, { content?: string; keccak256?: string }>;
  settings?: Record<string, unknown>;
}

export interface SourcifyMatch {
  match: "exact_match" | "partial_match" | "none";
  metadata?: SourcifyMetadata;
  /** Map of source file path → file content (Solidity / Vyper / etc.). */
  sources?: Record<string, string>;
}

interface SourcifyV2Response {
  match: "exact_match" | "match" | null;
  creationMatch?: "exact_match" | "match" | null;
  runtimeMatch?: "exact_match" | "match" | null;
  chainId?: string;
  address?: string;
  metadata?: SourcifyMetadata;
  sources?: Record<string, { content?: string }>;
}

function normalizeMatch(raw: SourcifyV2Response["match"]): SourcifyMatch["match"] {
  if (raw === "exact_match") return "exact_match";
  if (raw === "match") return "partial_match";
  return "none";
}

function flattenSources(raw: SourcifyV2Response["sources"]): Record<string, string> | undefined {
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const [path, file] of Object.entries(raw)) {
    if (typeof file.content === "string") {
      out[path] = file.content;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Look up a contract on Sourcify v2.
 *
 * Returns `{ match: 'none' }` if the contract is not verified (404 from
 * the upstream API). Throws on transport errors or unexpected 5xx.
 */
export async function lookup(chainId: number, address: string): Promise<SourcifyMatch> {
  const url = `${SOURCIFY_V2_BASE}/${String(chainId)}/${address}?fields=all`;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });

  // Sourcify v2 returns 404 for unverified contracts — that's a
  // semantically meaningful "no match" rather than an error.
  if (response.status === 404) {
    return { match: "none" };
  }
  if (!response.ok) {
    throw new Error(`sourcify v2 lookup failed: ${String(response.status)} ${response.statusText}`);
  }

  const body = (await response.json()) as SourcifyV2Response;
  const match = normalizeMatch(body.match);
  if (match === "none") {
    return { match: "none" };
  }
  const sources = flattenSources(body.sources);
  const result: SourcifyMatch = { match };
  if (body.metadata) {
    result.metadata = body.metadata;
  }
  if (sources) {
    result.sources = sources;
  }
  return result;
}
