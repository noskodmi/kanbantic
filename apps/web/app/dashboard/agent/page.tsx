/**
 * `/dashboard/agent` — agents owned by the connected wallet.
 *
 * Server-Component shell: fetches the indexer's agent + bounty lists
 * on every request and passes them to the client island that scopes
 * by `useAccount()`. Marked dynamic because the rendered output is
 * inherently wallet-scoped (no useful prerender) and we don't want
 * the build to require the worker to be online.
 */

import type { AgentSummary, BountySummary } from "@kanbantic/shared";

import { getAgents, getWork } from "../../_lib/api.js";
import { AgentDashboardClient } from "./_ui/AgentDashboardClient.js";

export const dynamic = "force-dynamic";

export default async function AgentDashboardPage() {
  let agents: AgentSummary[] = [];
  let bounties: BountySummary[] = [];
  try {
    const [agentList, workList] = await Promise.all([getAgents(), getWork()]);
    agents = agentList.agents;
    bounties = workList.bounties;
  } catch {
    // Indexer offline — render the island with empty lists. The client
    // will surface an empty/connect state instead of a hard error.
  }

  return <AgentDashboardClient agents={agents} bounties={bounties} />;
}
