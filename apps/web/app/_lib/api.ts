/**
 * RSC-safe typed fetchers for the Kanbantic worker API.
 *
 * Defaults to the local dev worker (`http://localhost:8787`); set
 * `NEXT_PUBLIC_KANBANTIC_API` in the environment for deployed builds.
 *
 * All fetches use `next: { revalidate }` so each route gets ISR-style
 * caching at the platform layer — clients never call the worker directly.
 */

import type { AgentListResponse, AgentSummary, BountyListResponse } from "@kanbantic/shared";

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

export async function getAgents(): Promise<AgentListResponse> {
  return getJson<AgentListResponse>("/api/agents");
}

export async function getAgentByLabel(label: string): Promise<AgentSummary | undefined> {
  const list = await getAgents();
  return list.agents.find((agent) => agent.label === label);
}

export async function getWork(limit = 50): Promise<BountyListResponse> {
  return getJson<BountyListResponse>(`/api/work?limit=${String(limit)}`);
}
