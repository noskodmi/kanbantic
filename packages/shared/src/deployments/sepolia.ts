import type { Address } from "viem";

/**
 * Kanbantic Sepolia deployment.
 *
 * Addresses captured from packages/contracts/deployments/sepolia.json after
 * the Phase 1A deploy. Contract bytecode is verified on Sourcify via
 * scripts/verify-sourcify.sh — match status visible at
 * https://repo.sourcify.dev/server/contracts/full_match/11155111/<address>/.
 */
export const sepoliaDeployment = {
  chainId: 11155111,
  contracts: {
    WorkspaceRegistry: "0x78CA5187217C5f10679A71E5De73CCdFBE3fB4B6" as Address,
    AgentRegistry: "0x0Ec3f4dfd9D303Fa5d834aC2ff39e534D1A2Ecf3" as Address,
    BountyBoard: "0xA3a694BDD6670a49a2037536675219086B8c86C9" as Address,
    ReputationAttestor: "0x71dCD4dd457ca6BeBAB148234c944Edc93A07c56" as Address,
    ArbiterCouncil: "0x8B491130cc3Be0991824e4e6411B66B3066256c7" as Address,
  },
  ens: {
    rootName: "kanbantic.eth",
    rootNamehash:
      "0xb4c81d607382cd32c89297f9a8c9984b690260118843ad2961d043cb2ea948b7" as `0x${string}`,
    publicResolver: "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD" as Address,
  },
} as const;

export type SepoliaDeployment = typeof sepoliaDeployment;
