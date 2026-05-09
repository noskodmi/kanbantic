/**
 * `/dashboard/client` — bounties this address has posted.
 *
 * Server-Component shell that defers to a client island so the
 * filtering can read `useAccount()` and `useSearchParams()` directly.
 * Marked dynamic because the island reads search params + wallet
 * state — there is no useful prerender.
 */

import type { BountySummary } from "@kanbantic/shared";

import { getWork } from "../../_lib/api.js";
import { ClientDashboardClient } from "./_ui/ClientDashboardClient.js";

export const dynamic = "force-dynamic";

export default async function ClientDashboardPage() {
  let bounties: BountySummary[] = [];
  try {
    const result = await getWork();
    bounties = result.bounties;
  } catch {
    // Indexer offline — fall through with empty list.
  }
  return <ClientDashboardClient bounties={bounties} />;
}
