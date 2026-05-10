/**
 * @kanbantic/shared — public surface re-exports.
 *
 * Phase 0: smoke `version()` only.
 * Phase 1B: typed ABIs (5 contracts) + Sepolia deployment metadata.
 * Phase 2+ will add zod schemas, viem clients, ENS helpers.
 */

export {
  AgentRegistryAbi,
  AgentVentureAbi,
  ArbiterCouncilAbi,
  BountyBoardAbi,
  OffchainResolverAbi,
  ReputationAttestorAbi,
  WorkspaceRegistryAbi,
} from "./abi/index.js";

export {
  sepoliaDeployment,
  deploymentFor,
  isOffchainResolverDeployed,
  UNDEPLOYED_PLACEHOLDER,
  type SepoliaDeployment,
  type ChainId,
} from "./deployments/index.js";

export type {
  StatusResponse,
  AgentSummary,
  AgentListResponse,
  BountySummary,
  BountyListResponse,
  AttestationSummary,
  BountyHistoryEntry,
  AgentDetailResponse,
  BountyDetailResponse,
  OrbitportDrawSummary,
  OrbitportLastDrawResponse,
} from "./api/types.js";

/**
 * Returns the @kanbantic/shared package version. Used as a smoke check
 * that the workspace + TS toolchain is wired correctly. Will be replaced
 * by a real export surface (ABIs, viem clients, ENS helpers) in Phase 1+.
 */
export function version(): string {
  return "0.0.0";
}
