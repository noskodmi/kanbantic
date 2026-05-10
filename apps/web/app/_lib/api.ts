/**
 * RSC-safe typed fetchers for the Kanbantic worker API.
 *
 * Defaults to the local dev worker (`http://localhost:8787`); set
 * `NEXT_PUBLIC_KANBANTIC_API` in the environment for deployed builds.
 *
 * All fetches use `next: { revalidate }` so each route gets ISR-style
 * caching at the platform layer — clients never call the worker directly.
 */

import type {
  AgentDetailResponse,
  AgentListResponse,
  AgentSummary,
  BountyDetailResponse,
  BountyListResponse,
  DiscoveredAgentsResponse,
  OrbitportLastDrawResponse,
} from "@kanbantic/shared";

export const API_BASE: string = process.env["NEXT_PUBLIC_KANBANTIC_API"] ?? "http://localhost:8787";

/** Default revalidation window for read-side endpoints, in seconds. */
const DEFAULT_REVALIDATE = 10;

interface FetchOptions {
  revalidate?: number;
}

async function getJson<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: options.revalidate ?? DEFAULT_REVALIDATE },
  });
  if (!response.ok) {
    throw new Error(`kanbantic api ${path} → ${String(response.status)}`);
  }
  return (await response.json()) as T;
}

/**
 * Per-call query-string assembly: only include keys with non-empty
 * string values so callers can pass `undefined` to opt out without
 * polluting the URL.
 */
function queryString(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const s = typeof value === "number" ? String(value) : value;
    if (s.length === 0) continue;
    usp.set(key, s);
  }
  const qs = usp.toString();
  return qs.length > 0 ? `?${qs}` : "";
}

export interface AgentListFilters {
  capability?: string | undefined;
  owner?: string | undefined;
  workspace?: string | undefined;
  reputationMin?: number | undefined;
  limit?: number | undefined;
}

export async function getAgents(filters: AgentListFilters = {}): Promise<AgentListResponse> {
  const qs = queryString({
    capability: filters.capability,
    owner: filters.owner,
    workspace: filters.workspace,
    reputationMin: filters.reputationMin,
    limit: filters.limit,
  });
  return getJson<AgentListResponse>(`/api/agents${qs}`);
}

/**
 * Per-agent detail fetch — calls `/api/agents/:node`. Returns
 * `undefined` instead of throwing on 404 so RSCs can call
 * `notFound()` cleanly.
 */
export async function getAgentDetail(node: string): Promise<AgentDetailResponse | undefined> {
  const url = `${API_BASE}/api/agents/${encodeURIComponent(node)}`;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: DEFAULT_REVALIDATE },
  });
  if (response.status === 404) return undefined;
  if (!response.ok) {
    throw new Error(`kanbantic api /api/agents/${node} → ${String(response.status)}`);
  }
  return (await response.json()) as AgentDetailResponse;
}

/**
 * Resolve an ENS-style label (`alice` for `alice.kanbantic.eth`) to its
 * AgentSummary by scanning the directory list. Used by the
 * `/agents/[name]` route until per-label lookup ships server-side.
 */
export async function getAgentByLabel(label: string): Promise<AgentSummary | undefined> {
  const list = await getAgents();
  return list.agents.find((agent) => agent.label === label);
}

export interface WorkListFilters {
  status?: string | undefined;
  capability?: string | undefined;
  poster?: string | undefined;
  workspace?: string | undefined;
  claimerNode?: string | undefined;
  limit?: number | undefined;
}

export async function getWork(
  limitOrFilters: number | WorkListFilters = 50,
): Promise<BountyListResponse> {
  const filters: WorkListFilters =
    typeof limitOrFilters === "number" ? { limit: limitOrFilters } : limitOrFilters;
  const qs = queryString({
    status: filters.status,
    capability: filters.capability,
    poster: filters.poster,
    workspace: filters.workspace,
    claimer_node: filters.claimerNode,
    limit: filters.limit ?? 50,
  });
  return getJson<BountyListResponse>(`/api/work${qs}`);
}

/**
 * Per-bounty detail fetch — calls `/api/work/:id`. Returns
 * `undefined` on 404 so RSCs can `notFound()` without try/catch.
 */
export async function getWorkDetail(id: string): Promise<BountyDetailResponse | undefined> {
  const url = `${API_BASE}/api/work/${encodeURIComponent(id)}`;
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: DEFAULT_REVALIDATE },
  });
  if (response.status === 404) return undefined;
  if (!response.ok) {
    throw new Error(`kanbantic api /api/work/${id} → ${String(response.status)}`);
  }
  return (await response.json()) as BountyDetailResponse;
}

export async function getOrbitportLastDraw(): Promise<OrbitportLastDrawResponse> {
  // Short revalidate — judges hitting refresh during a fair-claim
  // demo expect the latest draw within seconds.
  return getJson<OrbitportLastDrawResponse>("/api/orbitport/last-draw", { revalidate: 5 });
}

export async function getDiscovered(limit = 50): Promise<DiscoveredAgentsResponse> {
  return getJson<DiscoveredAgentsResponse>(`/api/discovered?limit=${String(limit)}`);
}
