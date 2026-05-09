import {
  AgentRegistryAbi,
  ArbiterCouncilAbi,
  BountyBoardAbi,
  ReputationAttestorAbi,
  WorkspaceRegistryAbi,
  sepoliaDeployment,
} from "@kanbantic/shared";
import { type Abi, decodeEventLog } from "viem";

import type { EvmLog } from "./poll.js";

export type ContractName = keyof typeof sepoliaDeployment.contracts;

const ADDRESS_TO_CONTRACT: Record<string, { name: ContractName; abi: Abi }> = {
  [sepoliaDeployment.contracts.WorkspaceRegistry.toLowerCase()]: {
    name: "WorkspaceRegistry",
    abi: WorkspaceRegistryAbi,
  },
  [sepoliaDeployment.contracts.AgentRegistry.toLowerCase()]: {
    name: "AgentRegistry",
    abi: AgentRegistryAbi,
  },
  [sepoliaDeployment.contracts.BountyBoard.toLowerCase()]: {
    name: "BountyBoard",
    abi: BountyBoardAbi,
  },
  [sepoliaDeployment.contracts.ReputationAttestor.toLowerCase()]: {
    name: "ReputationAttestor",
    abi: ReputationAttestorAbi,
  },
  [sepoliaDeployment.contracts.ArbiterCouncil.toLowerCase()]: {
    name: "ArbiterCouncil",
    abi: ArbiterCouncilAbi,
  },
};

export interface DecodedLog {
  contract: ContractName;
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: number;
  txHash: string;
  logIndex: number;
}

export function decode(log: EvmLog): DecodedLog | null {
  const entry = ADDRESS_TO_CONTRACT[log.address.toLowerCase()];
  if (!entry) return null;

  try {
    const decoded = decodeEventLog({
      abi: entry.abi,
      topics: log.topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
      data: log.data as `0x${string}`,
    });
    return {
      contract: entry.name,
      eventName: decoded.eventName as unknown as string,
      args: (decoded.args ?? {}) as Record<string, unknown>,
      blockNumber: Number.parseInt(log.blockNumber, 16),
      txHash: log.transactionHash,
      logIndex: Number.parseInt(log.logIndex, 16),
    };
  } catch (err) {
    console.warn("indexer: decode failed", {
      address: log.address,
      topic0: log.topics[0],
      err,
    });
    return null;
  }
}
