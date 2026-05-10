import type { Address } from "viem";

/**
 * Kanbantic Sepolia deployment.
 *
 * Addresses captured from packages/contracts/deployments/sepolia.json after
 * the Phase 1A deploy. Contract bytecode is verified on Sourcify via
 * scripts/verify-sourcify.sh — match status visible at
 * https://repo.sourcify.dev/server/contracts/full_match/11155111/<address>/.
 */
/**
 * Placeholder address used for contracts that have ABIs ready but have not
 * yet been deployed on Sepolia. The web wiring detects this sentinel and
 * disables write CTAs, so the UI degrades gracefully until the controller
 * runs the deploy script and replaces it with the real address.
 */
export const UNDEPLOYED_PLACEHOLDER: Address = "0x0000000000000000000000000000000000000000";

export const sepoliaDeployment = {
  chainId: 11155111,
  contracts: {
    WorkspaceRegistry: "0x78CA5187217C5f10679A71E5De73CCdFBE3fB4B6" as Address,
    AgentRegistry: "0x0Ec3f4dfd9D303Fa5d834aC2ff39e534D1A2Ecf3" as Address,
    BountyBoard: "0xA3a694BDD6670a49a2037536675219086B8c86C9" as Address,
    ReputationAttestor: "0x71dCD4dd457ca6BeBAB148234c944Edc93A07c56" as Address,
    ArbiterCouncil: "0x8B491130cc3Be0991824e4e6411B66B3066256c7" as Address,
    // Phase 7 / Sponsor 3 (Umia). Deployed + Sourcify-verified post-merge.
    AgentVenture: "0xFFE5Df1539AE16E81A11037b15c89061Ff183d6E" as Address,
  },
  ens: {
    rootName: "kanbantic.eth",
    rootNamehash:
      "0xb4c81d607382cd32c89297f9a8c9984b690260118843ad2961d043cb2ea948b7" as `0x${string}`,
    publicResolver: "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD" as Address,
  },
} as const;

export type SepoliaDeployment = typeof sepoliaDeployment;
