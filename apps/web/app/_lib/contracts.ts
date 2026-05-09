/**
 * Wallet-side contract write helpers.
 *
 * Thin wrappers around wagmi v2's `useWriteContract` for the two
 * Sepolia contracts the public web app writes to: `AgentRegistry`
 * (register/update agents) and `BountyBoard` (post/claim/settle
 * bounties). Each method maps directly to the on-chain function.
 *
 * Function names mirror the ABI (and the .sol files) — `register`,
 * `update`, `transferOwner`, `setProfileRef` for AgentRegistry, and
 * `post`, `claim`, `commitClaim`, `finalizeFairClaim`, `submit`,
 * `accept`, `reject` for BountyBoard.
 */

"use client";

import { sepoliaDeployment, AgentRegistryAbi, BountyBoardAbi } from "@kanbantic/shared";
import type { Address, Hex } from "viem";
import { useWriteContract } from "wagmi";

/**
 * Error shape exposed by `useWriteContract`. We re-derive it from the
 * hook return type rather than importing `@wagmi/core` directly so the
 * helper module has no extra dependency on the core package.
 */
type WriteContractError = ReturnType<typeof useWriteContract>["error"];

const AGENT_REGISTRY_ADDRESS: Address = sepoliaDeployment.contracts.AgentRegistry;
const BOUNTY_BOARD_ADDRESS: Address = sepoliaDeployment.contracts.BountyBoard;

/**
 * Empty bytes payload. Used for ABI-required `bytes` parameters that
 * Phase 1 contracts ignore on-chain (e.g., the `ownerSignature` arg on
 * `submit`, the `orbitportSig` arg on `finalizeFairClaim`).
 */
const EMPTY_BYTES: Hex = "0x";

export interface RegisterAgentArgs {
  parentNode: Hex;
  label: string;
  mcpEndpoint: string;
  capabilities: string;
}

export interface UpdateAgentArgs {
  node: Hex;
  mcpEndpoint: string;
  capabilities: string;
}

export interface TransferAgentArgs {
  node: Hex;
  newOwner: Address;
}

export interface SetProfileRefArgs {
  node: Hex;
  profileRef: Hex;
}

export interface UseAgentRegistryReturn {
  register: (args: RegisterAgentArgs) => void;
  update: (args: UpdateAgentArgs) => void;
  transferOwner: (args: TransferAgentArgs) => void;
  setProfileRef: (args: SetProfileRefArgs) => void;
  isPending: boolean;
  error: WriteContractError;
  hash: Hex | undefined;
  reset: () => void;
}

/**
 * `useAgentRegistry` — wraps `useWriteContract` against
 * `AgentRegistry` at `sepoliaDeployment.contracts.AgentRegistry`.
 *
 * The `register` helper expects a `parentNode` namehash; for the
 * public namespace pass `sepoliaDeployment.ens.rootNamehash`. The
 * contract derives the agent's leaf node as
 * `keccak256(parentNode, keccak256(label))` (see
 * `AgentRegistry._nodeFor`).
 */
export function useAgentRegistry(): UseAgentRegistryReturn {
  const { writeContract, data, isPending, error, reset } = useWriteContract();

  return {
    register: ({ parentNode, label, mcpEndpoint, capabilities }) => {
      writeContract({
        abi: AgentRegistryAbi,
        address: AGENT_REGISTRY_ADDRESS,
        functionName: "register",
        args: [parentNode, label, mcpEndpoint, capabilities],
      });
    },
    update: ({ node, mcpEndpoint, capabilities }) => {
      writeContract({
        abi: AgentRegistryAbi,
        address: AGENT_REGISTRY_ADDRESS,
        functionName: "update",
        args: [node, mcpEndpoint, capabilities],
      });
    },
    transferOwner: ({ node, newOwner }) => {
      writeContract({
        abi: AgentRegistryAbi,
        address: AGENT_REGISTRY_ADDRESS,
        functionName: "transferOwner",
        args: [node, newOwner],
      });
    },
    setProfileRef: ({ node, profileRef }) => {
      writeContract({
        abi: AgentRegistryAbi,
        address: AGENT_REGISTRY_ADDRESS,
        functionName: "setProfileRef",
        args: [node, profileRef],
      });
    },
    isPending,
    error,
    hash: data,
    reset,
  };
}

export interface PostBountyArgs {
  capabilityFilter: string;
  reward: bigint;
  descriptionRef: Hex;
  expiresAt: bigint;
  claimWindowBlocks: number;
  workspaceNode: Hex;
  arbiterCouncil: Address;
}

export interface ClaimBountyArgs {
  bountyId: bigint;
  agentNode: Hex;
}

export interface CommitClaimArgs {
  bountyId: bigint;
  commitment: Hex;
}

export interface FinalizeFairClaimArgs {
  bountyId: bigint;
  ctrngDraw: Hex;
  orbitportSig?: Hex;
}

export interface SubmitProofArgs {
  bountyId: bigint;
  proofRef: Hex;
  ownerSignature?: Hex;
}

export interface AcceptArgs {
  bountyId: bigint;
}

export interface RejectArgs {
  bountyId: bigint;
  reasonRef: Hex;
}

export interface UseBountyBoardReturn {
  post: (args: PostBountyArgs) => void;
  claim: (args: ClaimBountyArgs) => void;
  commitClaim: (args: CommitClaimArgs) => void;
  finalizeFairClaim: (args: FinalizeFairClaimArgs) => void;
  submit: (args: SubmitProofArgs) => void;
  accept: (args: AcceptArgs) => void;
  reject: (args: RejectArgs) => void;
  isPending: boolean;
  error: WriteContractError;
  hash: Hex | undefined;
  reset: () => void;
}

/**
 * `useBountyBoard` — wraps `useWriteContract` against `BountyBoard`
 * at `sepoliaDeployment.contracts.BountyBoard`.
 *
 * `post` is payable: the caller passes `reward` (wei) which is also
 * forwarded as `value` so `msg.value === reward` (the contract reverts
 * with `RewardValueMismatch` otherwise). Use viem's `parseEther` to
 * convert from human-readable ETH.
 */
export function useBountyBoard(): UseBountyBoardReturn {
  const { writeContract, data, isPending, error, reset } = useWriteContract();

  return {
    post: ({
      capabilityFilter,
      reward,
      descriptionRef,
      expiresAt,
      claimWindowBlocks,
      workspaceNode,
      arbiterCouncil,
    }) => {
      writeContract({
        abi: BountyBoardAbi,
        address: BOUNTY_BOARD_ADDRESS,
        functionName: "post",
        args: [
          capabilityFilter,
          reward,
          descriptionRef,
          expiresAt,
          claimWindowBlocks,
          workspaceNode,
          arbiterCouncil,
        ],
        value: reward,
      });
    },
    claim: ({ bountyId, agentNode }) => {
      writeContract({
        abi: BountyBoardAbi,
        address: BOUNTY_BOARD_ADDRESS,
        functionName: "claim",
        args: [bountyId, agentNode],
      });
    },
    commitClaim: ({ bountyId, commitment }) => {
      writeContract({
        abi: BountyBoardAbi,
        address: BOUNTY_BOARD_ADDRESS,
        functionName: "commitClaim",
        args: [bountyId, commitment],
      });
    },
    finalizeFairClaim: ({ bountyId, ctrngDraw, orbitportSig = EMPTY_BYTES }) => {
      writeContract({
        abi: BountyBoardAbi,
        address: BOUNTY_BOARD_ADDRESS,
        functionName: "finalizeFairClaim",
        args: [bountyId, ctrngDraw, orbitportSig],
      });
    },
    submit: ({ bountyId, proofRef, ownerSignature = EMPTY_BYTES }) => {
      writeContract({
        abi: BountyBoardAbi,
        address: BOUNTY_BOARD_ADDRESS,
        functionName: "submit",
        args: [bountyId, proofRef, ownerSignature],
      });
    },
    accept: ({ bountyId }) => {
      writeContract({
        abi: BountyBoardAbi,
        address: BOUNTY_BOARD_ADDRESS,
        functionName: "accept",
        args: [bountyId],
      });
    },
    reject: ({ bountyId, reasonRef }) => {
      writeContract({
        abi: BountyBoardAbi,
        address: BOUNTY_BOARD_ADDRESS,
        functionName: "reject",
        args: [bountyId, reasonRef],
      });
    },
    isPending,
    error,
    hash: data,
    reset,
  };
}
