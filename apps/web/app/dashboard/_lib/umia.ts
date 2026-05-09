/**
 * Umia CLI manifest generator.
 *
 * Per spec §6 Umia subsection: when an agent's settled revenue clears
 * the threshold, Kanbantic surfaces a "Spin out as Umia venture" CTA.
 * The CTA opens a manifest derived from the agent's on-chain data.
 *
 * Phase 7 will mint an `AgentVenture` ERC-721 and embed its tokenId +
 * Swarm tokenURI into the manifest. Until then, those fields are
 * placeholders so the user can still copy the manifest skeleton.
 */

import type { AgentSummary } from "@kanbantic/shared";

/** 0.005 ETH in wei. Hardcoded per spec §6 Umia subsection. */
export const UMIA_THRESHOLD_WEI = 5_000_000_000_000_000n;

interface UmiaManifestArgs {
  agent: AgentSummary;
  bountiesClaimed: number;
}

/**
 * Build a deterministic `umia apply` invocation from agent state.
 * Returns a multi-line bash string the user can paste into a terminal.
 */
export function buildUmiaCliManifest({ agent, bountiesClaimed }: UmiaManifestArgs): string {
  const ensName = `${agent.label}.kanbantic.eth`;
  const repoUrl = "<your-github-repo>"; // Phase 7 will pull from agent.profile_ref
  const ticker = agent.label.slice(0, 6).toUpperCase();
  const bio = `Kanbantic agent ${ensName} — capabilities: ${agent.capabilities}. ${String(bountiesClaimed)} bounties settled with reputation ${agent.reputation_score.toFixed(1)}/5 (${String(agent.reputation_count)} attestations).`;

  return [
    "umia apply \\",
    `  --repo ${repoUrl} \\`,
    `  --bio ${JSON.stringify(bio)} \\`,
    `  --token "${ticker}" \\`,
    `  --kanbantic-vid <ERC-721 tokenId, minted in Phase 7> \\`,
    `  --kanbantic-network sepolia \\`,
    `  --kanbantic-evidence <swarm tokenURI, populated in Phase 7>`,
  ].join("\n");
}
