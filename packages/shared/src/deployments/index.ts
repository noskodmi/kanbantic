import { sepoliaDeployment } from "./sepolia.js";

export { sepoliaDeployment, type SepoliaDeployment } from "./sepolia.js";

export const DEPLOYMENTS = {
  [sepoliaDeployment.chainId]: sepoliaDeployment,
} as const;

export type ChainId = keyof typeof DEPLOYMENTS;

/**
 * Look up a deployment by chain id. Throws if the chain isn't supported.
 *
 * Phase 1B ships only Sepolia (`11155111`). Phase 7+ may add mainnet.
 */
export function deploymentFor(chainId: number): typeof sepoliaDeployment {
  if (chainId !== sepoliaDeployment.chainId) {
    throw new Error(
      `No deployment for chain id ${String(chainId)}. Supported: ${String(sepoliaDeployment.chainId)}`,
    );
  }
  return sepoliaDeployment;
}
