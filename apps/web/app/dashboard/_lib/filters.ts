/**
 * Shared filter + aggregate helpers for the wallet-scoped dashboards.
 *
 * The worker emits addresses as mixed-case hex; wagmi's `useAccount`
 * returns checksummed addresses. We normalise both sides to lowercase
 * before comparing. Reward arithmetic uses `BigInt` because the API
 * carries `reward` as a wei-decimal string — `Number` would silently
 * lose precision past ~1.8e16 wei (≈0.018 ETH).
 */

import type { AgentSummary, BountySummary } from "@kanbantic/shared";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function normalise(addr: string | null | undefined): string | null {
  if (typeof addr !== "string" || addr.length === 0) return null;
  return addr.toLowerCase();
}

export function filterByOwner(agents: readonly AgentSummary[], address: string): AgentSummary[] {
  const target = normalise(address);
  if (target === null) return [];
  return agents.filter((agent) => normalise(agent.owner) === target);
}

export function filterByPoster(
  bounties: readonly BountySummary[],
  address: string,
): BountySummary[] {
  const target = normalise(address);
  if (target === null) return [];
  return bounties.filter((bounty) => normalise(bounty.poster) === target);
}

export function filterByClaimer(
  bounties: readonly BountySummary[],
  agentNode: string,
): BountySummary[] {
  const target = normalise(agentNode);
  if (target === null) return [];
  return bounties.filter((bounty) => normalise(bounty.claimer_node) === target);
}

/**
 * Sum the `reward` (wei) of every Resolved bounty whose `claimer_node`
 * matches the given agent. Returns `0n` when no settled rewards exist.
 *
 * Robust to malformed reward strings — silently skips entries that
 * fail `BigInt()` rather than throwing.
 */
export function sumSettledRewardsForAgent(
  bounties: readonly BountySummary[],
  agentNode: string,
): bigint {
  const target = normalise(agentNode);
  if (target === null) return 0n;

  let total = 0n;
  for (const bounty of bounties) {
    if (bounty.status !== "Resolved") continue;
    if (normalise(bounty.claimer_node) !== target) continue;
    try {
      total += BigInt(bounty.reward);
    } catch {
      continue;
    }
  }
  return total;
}

/**
 * Disputed bounties whose `arbiter_council` matches the given council
 * address. Until per-workspace councils ship, callers pass
 * `sepoliaDeployment.contracts.ArbiterCouncil` to surface every
 * dispute against the Phase 1B council.
 */
export function filterDisputesForCouncil(
  bounties: readonly BountySummary[],
  councilAddress: string,
): BountySummary[] {
  const target = normalise(councilAddress);
  if (target === null) return [];
  return bounties.filter(
    (bounty) => bounty.status === "Disputed" && normalise(bounty.arbiter_council) === target,
  );
}

const CONTRACT_INTELLIGENCE_CAPS = new Set(["audit", "explain", "similarity"]);

export function filterContractIntelligence(bounties: readonly BountySummary[]): BountySummary[] {
  return bounties.filter((bounty) =>
    CONTRACT_INTELLIGENCE_CAPS.has(bounty.capability.toLowerCase()),
  );
}

/**
 * Display helper — returns true when the council address is the
 * "no-arbiter" zero address, used for bounties that don't designate
 * a council.
 */
export function isZeroAddress(address: string | null | undefined): boolean {
  return normalise(address) === ZERO_ADDRESS;
}
