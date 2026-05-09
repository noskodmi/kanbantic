/**
 * `/dashboard/arbiter` — open disputes for the configured council.
 *
 * Server-Component shell. Filtering happens client-side so the
 * island can render a Connect prompt for an unconnected wallet
 * (consistent with the other dashboards' shell behaviour). Marked
 * dynamic because the island reads wallet state — no useful
 * prerender.
 */

import type { BountySummary } from "@kanbantic/shared";

import { getWork } from "../../_lib/api.js";
import { ArbiterDashboardClient } from "./_ui/ArbiterDashboardClient.js";

export const dynamic = "force-dynamic";

export default async function ArbiterDashboardPage() {
  let bounties: BountySummary[] = [];
  try {
    const result = await getWork();
    bounties = result.bounties;
  } catch {
    // Indexer offline — fall through with empty list.
  }
  return <ArbiterDashboardClient bounties={bounties} />;
}
