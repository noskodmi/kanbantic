"use client";

/**
 * `WorkActions` — wallet-gated CTAs on the bounty detail page.
 *
 * Branches on `bounty.status` and the connected wallet's relationship
 * to the bounty (poster vs claimer vs neither) to render exactly the
 * right call-to-action:
 *
 *   - Open                ─ "Claim bounty" (non-poster only)
 *   - ClaimWindowOpen     ─ "Commit claim" (non-poster only) — generates
 *                            a random nonce, computes
 *                            `keccak256(abi.encodePacked(addr, nonce))`,
 *                            warns the user to save the nonce.
 *   - Claimed             ─ "Submit proof" (claimer only)
 *   - Submitted           ─ "Accept" (opens AttestationModal) /
 *                            "Reject" (poster only)
 *   - Resolved/Disputed/
 *     Refunded/CWClosed   ─ informational footer, no actions.
 *
 * The "Accept" path opens `AttestationModal`, which collects a
 * 1-5 score + optional comment. On submit the parent fires two
 * sequential transactions:
 *
 *   1. `ReputationAttestor.attest(...)` (gates on `msg.sender ==
 *       posterOf(bountyId)` — no EIP-712).
 *   2. `BountyBoard.accept(bountyId)` once the attest tx confirms.
 *
 * Reject opens `RejectModal`, which collects an optional reason
 * (hashed into a 32-byte `reasonRef` — Phase 7 will pin the original
 * text to Swarm) and calls `BountyBoard.reject(bountyId, reasonRef)`.
 */

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import type { ChangeEvent, SyntheticEvent } from "react";
import { encodePacked, isHex, keccak256, toBytes } from "viem";
import type { Hex } from "viem";
import { useAccount, useWaitForTransactionReceipt } from "wagmi";
import { cn } from "@kanbantic/ui";
import { sepoliaDeployment } from "@kanbantic/shared";
import type { AgentSummary, BountySummary, StatusResponse } from "@kanbantic/shared";

import { API_BASE, getAgents } from "../../../_lib/api.js";
import { etherscanAddress } from "../../../_lib/format.js";
import { useBountyBoard, useReputationAttestor } from "../../../_lib/contracts.js";
import { AcceptStealthHint } from "./AcceptStealthHint.js";
import { AttestationModal } from "./AttestationModal.js";
import type { AttestationSubmitArgs } from "./AttestationModal.js";
import { OrbitportWaitingPanel } from "./OrbitportWaitingPanel.js";
import { RejectModal } from "./RejectModal.js";
import type { RejectSubmitArgs } from "./RejectModal.js";

const ETHERSCAN_TX = "https://sepolia.etherscan.io/tx";

const TERMINAL_STATUSES: Record<string, string> = {
  Resolved: "This bounty is resolved — payout has been released to the claimer.",
  Disputed: "This bounty is in dispute. The arbiter council will settle it.",
  Refunded: "This bounty was refunded — escrow has been returned to the poster.",
  ClaimWindowClosed:
    "Claim window closed. The Orbitport draw will pick a winner — refresh in a moment.",
};

interface WorkActionsProps {
  bounty: BountySummary;
}

function lower(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  return s.toLowerCase();
}

function generateNonce(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function isOwnedAgent(agent: AgentSummary, wallet: string | null): boolean {
  if (wallet === null) return false;
  return agent.owner.toLowerCase() === wallet;
}

export function WorkActions({ bounty }: WorkActionsProps) {
  const { address, isConnected } = useAccount();
  const wallet = lower(address ?? null);

  const isPoster = wallet !== null && wallet === bounty.poster.toLowerCase();
  const isClaimer =
    wallet !== null &&
    bounty.claimer_address !== null &&
    wallet === bounty.claimer_address.toLowerCase();

  if (!isConnected) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <p className="text-sm text-[var(--color-kanbantic-fg)]/85">
          Connect your wallet to claim or settle this bounty.
        </p>
        <div>
          <ConnectButton />
        </div>
      </section>
    );
  }

  const terminalCopy = TERMINAL_STATUSES[bounty.status];
  if (terminalCopy !== undefined) {
    return (
      <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-[var(--color-kanbantic-fg)]/80">
        {terminalCopy}
      </section>
    );
  }

  if (bounty.status === "Open") {
    if (isPoster) {
      return (
        <PosterCantSelfClaim message="You posted this bounty — wait for an agent to claim it." />
      );
    }
    return <ClaimAction bounty={bounty} wallet={wallet} />;
  }

  if (bounty.status === "ClaimWindowOpen") {
    return <ClaimWindowOpenBranch bounty={bounty} isPoster={isPoster} />;
  }

  if (bounty.status === "Claimed") {
    if (!isClaimer) {
      return (
        <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-[var(--color-kanbantic-fg)]/80">
          Bounty claimed — only the claimer can submit proof of work.
        </section>
      );
    }
    return <SubmitProofAction bounty={bounty} />;
  }

  if (bounty.status === "Submitted") {
    if (!isPoster) {
      return (
        <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-[var(--color-kanbantic-fg)]/80">
          Submission is in. The poster will accept or reject it.
        </section>
      );
    }
    return <SettleAction bounty={bounty} />;
  }

  // Future statuses we don't render explicitly — keep the page intact.
  return null;
}

function PosterCantSelfClaim({ message }: { message: string }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-[var(--color-kanbantic-fg)]/80">
      {message}
    </section>
  );
}

interface TxStatusBlockProps {
  hash: Hex | undefined;
  pending: boolean;
  isConfirming: boolean;
  isConfirmed: boolean;
  errorMessage: string | null;
  successCopy: string;
}

function TxStatusBlock({
  hash,
  pending,
  isConfirming,
  isConfirmed,
  errorMessage,
  successCopy,
}: TxStatusBlockProps) {
  if (errorMessage !== null) {
    return (
      <div
        role="alert"
        className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
      >
        {errorMessage}
      </div>
    );
  }

  if (hash === undefined) {
    if (pending) {
      return (
        <p className="text-xs text-[var(--color-kanbantic-muted)]">
          Confirm the transaction in your wallet…
        </p>
      );
    }
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-3 text-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[var(--color-kanbantic-muted)]">tx:</span>
        <a
          href={`${ETHERSCAN_TX}/${hash}`}
          target="_blank"
          rel="noreferrer noopener"
          className="break-all font-mono text-[var(--color-kanbantic-accent)] hover:underline"
        >
          {hash}
        </a>
      </div>
      {isConfirming ? (
        <p className="text-[var(--color-kanbantic-muted)]">Waiting for confirmation…</p>
      ) : null}
      {isConfirmed ? (
        <p className="text-green-400">
          {successCopy} Indexer is processing — UI will update in ~10s.
        </p>
      ) : null}
    </div>
  );
}

// ─────────────────────────── Claim ─────────────────────────── //

interface ClaimActionProps {
  bounty: BountySummary;
  wallet: string | null;
}

function ClaimAction({ bounty, wallet }: ClaimActionProps) {
  const selectId = useId();
  const { claim, isPending, error, hash, reset } = useBountyBoard();
  const receipt = useWaitForTransactionReceipt({ hash });

  const agentsQuery = useQuery({
    queryKey: ["agents", "owned-by", wallet ?? ""],
    queryFn: () => getAgents(),
    staleTime: 10_000,
  });

  const ownedAgents = useMemo<AgentSummary[]>(() => {
    if (!agentsQuery.data) return [];
    return agentsQuery.data.agents.filter((a) => isOwnedAgent(a, wallet));
  }, [agentsQuery.data, wallet]);

  const [selectedNode, setSelectedNode] = useState<string>("");

  // Default to the first owned agent once loaded.
  useEffect(() => {
    if (selectedNode === "" && ownedAgents.length > 0 && ownedAgents[0]) {
      setSelectedNode(ownedAgents[0].node);
    }
  }, [ownedAgents, selectedNode]);

  if (agentsQuery.isLoading) {
    return (
      <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-[var(--color-kanbantic-muted)]">
        Loading your agents…
      </section>
    );
  }

  if (ownedAgents.length === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm">
        <p>You need to register an agent before you can claim this bounty.</p>
        <Link
          href="/register"
          className="self-start rounded-md border border-[var(--color-kanbantic-accent)]/60 bg-[var(--color-kanbantic-accent)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--color-kanbantic-accent)] hover:bg-[var(--color-kanbantic-accent)]/20"
        >
          Register an agent →
        </Link>
      </section>
    );
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedNode || !isHex(selectedNode) || isPending) return;
    claim({ bountyId: BigInt(bounty.id), agentNode: selectedNode });
  }

  const errorMessage = error?.message ?? receipt.error?.message ?? null;

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-4"
    >
      <fieldset
        disabled={isPending || receipt.isLoading || receipt.isSuccess}
        className="flex flex-col gap-3"
      >
        <label htmlFor={selectId} className="text-sm font-medium">
          Claim as
        </label>
        <select
          id={selectId}
          value={selectedNode}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            setSelectedNode(e.target.value);
          }}
          className="rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
        >
          {ownedAgents.map((agent) => (
            <option key={agent.node} value={agent.node} className="bg-black">
              {agent.label} · {agent.capabilities}
            </option>
          ))}
        </select>
      </fieldset>

      <button
        type="submit"
        disabled={!selectedNode || isPending || receipt.isLoading || receipt.isSuccess}
        className={cn(
          "self-start rounded-md px-4 py-2 text-sm font-semibold transition-opacity",
          "bg-[var(--color-kanbantic-accent)] text-[var(--color-kanbantic-bg)]",
          "disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:opacity-90",
        )}
      >
        {receipt.isSuccess
          ? "Claimed"
          : isPending
            ? "Sign in wallet…"
            : receipt.isLoading
              ? "Submitting…"
              : "Claim bounty"}
      </button>

      <TxStatusBlock
        hash={hash}
        pending={isPending}
        isConfirming={receipt.isLoading}
        isConfirmed={receipt.isSuccess}
        errorMessage={errorMessage}
        successCopy="Claim confirmed."
      />

      {receipt.isSuccess ? (
        <button
          type="button"
          onClick={reset}
          className="self-start text-xs text-[var(--color-kanbantic-muted)] underline hover:text-[var(--color-kanbantic-fg)]"
        >
          Reset
        </button>
      ) : null}
    </form>
  );
}

// ─────────────────────── Commit-claim ─────────────────────── //

/**
 * Polls `/api/status` to learn the indexed Sepolia head, then either:
 *   - renders the `OrbitportWaitingPanel` if the commit window has closed
 *     (we're between window-close and the worker's `finalizeFairClaim`
 *     tx landing — the on-chain status is still `ClaimWindowOpen` but
 *     no new commits can be accepted); or
 *   - renders `CommitClaimAction` (or the "you posted this" panel) if
 *     the window is still open.
 */
function ClaimWindowOpenBranch({ bounty, isPoster }: { bounty: BountySummary; isPoster: boolean }) {
  const status = useQuery({
    queryKey: ["status"],
    queryFn: async (): Promise<StatusResponse> => {
      const res = await fetch(`${API_BASE}/api/status`, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`status ${String(res.status)}`);
      return (await res.json()) as StatusResponse;
    },
    refetchInterval: 10_000,
    retry: false,
  });

  const closeBlock =
    bounty.claim_window_start_block !== null && bounty.claim_window_blocks > 0
      ? bounty.claim_window_start_block + bounty.claim_window_blocks
      : null;

  const head = status.data?.lastBlock ?? null;
  const windowClosed = closeBlock !== null && head !== null && head >= closeBlock;

  if (windowClosed) {
    return (
      <OrbitportWaitingPanel
        bounty={bounty}
        bountyBoardEtherscan={etherscanAddress(sepoliaDeployment.contracts.BountyBoard)}
      />
    );
  }

  if (isPoster) {
    return (
      <PosterCantSelfClaim message="You posted this bounty — wait for agents to commit during the claim window." />
    );
  }

  return <CommitClaimAction bounty={bounty} />;
}

interface CommitClaimActionProps {
  bounty: BountySummary;
}

function CommitClaimAction({ bounty }: CommitClaimActionProps) {
  const { address } = useAccount();
  const { commitClaim, isPending, error, hash, reset } = useBountyBoard();
  const receipt = useWaitForTransactionReceipt({ hash });

  const [nonce, setNonce] = useState<Hex>(() => generateNonce());
  const [copied, setCopied] = useState(false);

  const commitment = useMemo<Hex | null>(() => {
    if (address === undefined) return null;
    return keccak256(encodePacked(["address", "bytes32"], [address, nonce]));
  }, [address, nonce]);

  function regenerate() {
    setNonce(generateNonce());
    setCopied(false);
  }

  function copyNonce() {
    navigator.clipboard
      .writeText(nonce)
      .then(() => {
        setCopied(true);
      })
      .catch(() => {
        // Clipboard may be blocked — user can still copy manually.
        setCopied(false);
      });
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (commitment === null || isPending) return;
    commitClaim({ bountyId: BigInt(bounty.id), commitment });
  }

  const errorMessage = error?.message ?? receipt.error?.message ?? null;

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-4"
    >
      <div
        role="note"
        className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-xs text-yellow-200/90"
      >
        Save your nonce — you will need it to reveal your claim after the window closes. Losing it
        forfeits your slot.
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Nonce (32 bytes)</span>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="flex-1 break-all rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs">
            {nonce}
          </code>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyNonce}
              className="rounded-md border border-white/10 px-3 py-1.5 text-xs hover:border-white/30"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              type="button"
              onClick={regenerate}
              disabled={isPending || receipt.isLoading}
              className="rounded-md border border-white/10 px-3 py-1.5 text-xs hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Regenerate
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Commitment</span>
        <code className="break-all rounded-md border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-[var(--color-kanbantic-fg)]/80">
          {commitment ?? "connect wallet to compute"}
        </code>
        <p className="text-xs text-[var(--color-kanbantic-muted)]">
          keccak256(abi.encodePacked(your-address, nonce))
        </p>
      </div>

      <button
        type="submit"
        disabled={commitment === null || isPending || receipt.isLoading || receipt.isSuccess}
        className={cn(
          "self-start rounded-md px-4 py-2 text-sm font-semibold transition-opacity",
          "bg-[var(--color-kanbantic-accent)] text-[var(--color-kanbantic-bg)]",
          "disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:opacity-90",
        )}
      >
        {receipt.isSuccess
          ? "Committed"
          : isPending
            ? "Sign in wallet…"
            : receipt.isLoading
              ? "Submitting…"
              : "Commit claim"}
      </button>

      <TxStatusBlock
        hash={hash}
        pending={isPending}
        isConfirming={receipt.isLoading}
        isConfirmed={receipt.isSuccess}
        errorMessage={errorMessage}
        successCopy="Commit confirmed."
      />

      {receipt.isSuccess ? (
        <button
          type="button"
          onClick={reset}
          className="self-start text-xs text-[var(--color-kanbantic-muted)] underline hover:text-[var(--color-kanbantic-fg)]"
        >
          Reset
        </button>
      ) : null}
    </form>
  );
}

// ──────────────────────── Submit proof ─────────────────────── //

interface SubmitProofActionProps {
  bounty: BountySummary;
}

function SubmitProofAction({ bounty }: SubmitProofActionProps) {
  const proofId = useId();
  const { submit, isPending, error, hash, reset } = useBountyBoard();
  const receipt = useWaitForTransactionReceipt({ hash });

  const [proofRef, setProofRef] = useState<string>("");

  const proofValidation = useMemo<{ value: Hex | null; error: string | null }>(() => {
    const trimmed = proofRef.trim();
    if (!trimmed) return { value: null, error: "Proof ref is required." };
    if (!/^0x[0-9a-fA-F]{64}$/.test(trimmed)) {
      return {
        value: null,
        error: "Must be a 0x-prefixed 32-byte hex string.",
      };
    }
    return { value: trimmed as Hex, error: null };
  }, [proofRef]);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (proofValidation.value === null || isPending) return;
    submit({ bountyId: BigInt(bounty.id), proofRef: proofValidation.value });
  }

  // When user pastes a UTF-8 string, hash it for them.
  function fillFromText(text: string) {
    if (!text) return;
    const hashed = keccak256(toBytes(text));
    setProofRef(hashed);
  }

  const errorMessage = error?.message ?? receipt.error?.message ?? null;

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-4"
    >
      <fieldset
        disabled={isPending || receipt.isLoading || receipt.isSuccess}
        className="flex flex-col gap-3"
      >
        <label htmlFor={proofId} className="text-sm font-medium">
          Proof ref (bytes32)
        </label>
        <input
          id={proofId}
          type="text"
          value={proofRef}
          onChange={(e) => {
            setProofRef(e.target.value);
          }}
          placeholder="0x… (32-byte Swarm hash; Phase 7 will upload for you)"
          autoComplete="off"
          spellCheck={false}
          className="rounded-md border border-white/10 bg-transparent px-3 py-2 font-mono text-xs focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
        />
        <details className="text-xs text-[var(--color-kanbantic-muted)]">
          <summary className="cursor-pointer">No hash yet? Hash a string locally</summary>
          <textarea
            rows={3}
            placeholder="paste any text — keccak256 fills the field above"
            onChange={(e) => {
              fillFromText(e.target.value);
            }}
            className="mt-2 w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-xs focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
          />
        </details>
        {proofValidation.error && proofRef ? (
          <p className="text-xs text-red-400">{proofValidation.error}</p>
        ) : null}
      </fieldset>

      <button
        type="submit"
        disabled={
          proofValidation.value === null || isPending || receipt.isLoading || receipt.isSuccess
        }
        className={cn(
          "self-start rounded-md px-4 py-2 text-sm font-semibold transition-opacity",
          "bg-[var(--color-kanbantic-accent)] text-[var(--color-kanbantic-bg)]",
          "disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:opacity-90",
        )}
      >
        {receipt.isSuccess
          ? "Submitted"
          : isPending
            ? "Sign in wallet…"
            : receipt.isLoading
              ? "Submitting…"
              : "Submit proof"}
      </button>

      <TxStatusBlock
        hash={hash}
        pending={isPending}
        isConfirming={receipt.isLoading}
        isConfirmed={receipt.isSuccess}
        errorMessage={errorMessage}
        successCopy="Submission confirmed."
      />

      {receipt.isSuccess ? (
        <button
          type="button"
          onClick={reset}
          className="self-start text-xs text-[var(--color-kanbantic-muted)] underline hover:text-[var(--color-kanbantic-fg)]"
        >
          Reset
        </button>
      ) : null}
    </form>
  );
}

// ─────────────────── Settle (accept / reject) ──────────────── //

interface SettleActionProps {
  bounty: BountySummary;
}

function SettleAction({ bounty }: SettleActionProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  // Look up the claimer agent so we can surface its EIP-5564 stealth
  // meta-address (if it published one) on the accept hint. Cheap shared
  // cache via react-query — `/agents` is already loaded elsewhere.
  const agentsQuery = useQuery({
    queryKey: ["agents", "all"],
    queryFn: () => getAgents(),
    staleTime: 10_000,
  });
  const claimerCapabilities = useMemo<string>(() => {
    if (bounty.claimer_node === null) return "";
    const list = agentsQuery.data?.agents ?? [];
    const match = list.find((a) => a.node.toLowerCase() === bounty.claimer_node?.toLowerCase());
    return match?.capabilities ?? "";
  }, [agentsQuery.data, bounty.claimer_node]);

  // accept-flow uses two helpers, two transactions: attest then accept.
  const attestor = useReputationAttestor();
  const board = useBountyBoard();

  const attestReceipt = useWaitForTransactionReceipt({ hash: attestor.hash });
  const acceptReceipt = useWaitForTransactionReceipt({ hash: board.hash });

  const [acceptStarted, setAcceptStarted] = useState(false);

  // After attest confirms, fire accept automatically (one click → two txs).
  useEffect(() => {
    if (attestReceipt.isSuccess && !acceptStarted && board.hash === undefined && !board.isPending) {
      setAcceptStarted(true);
      board.accept({ bountyId: BigInt(bounty.id) });
    }
  }, [attestReceipt.isSuccess, acceptStarted, board, bounty.id]);

  // Close the modal once the accept tx confirms.
  useEffect(() => {
    if (acceptReceipt.isSuccess && modalOpen) {
      setModalOpen(false);
    }
  }, [acceptReceipt.isSuccess, modalOpen]);

  function onAttestSubmit(args: AttestationSubmitArgs) {
    if (bounty.claimer_node === null) return;
    if (!isHex(bounty.claimer_node)) return;

    setAcceptStarted(false);
    attestor.reset();
    board.reset();

    attestor.attest({
      bountyId: BigInt(bounty.id),
      agentNode: bounty.claimer_node,
      score: args.score,
      commentRef: args.commentRef,
    });
  }

  function onRejectSubmit(args: RejectSubmitArgs) {
    board.reset();
    board.reject({ bountyId: BigInt(bounty.id), reasonRef: args.reasonRef });
  }

  // Close the reject modal once the reject tx confirms.
  useEffect(() => {
    if (acceptReceipt.isSuccess && rejectOpen && !acceptStarted) {
      // `acceptReceipt` watches `board.hash` — for reject it represents
      // the reject tx confirmation (no attest happens before reject).
      setRejectOpen(false);
    }
  }, [acceptReceipt.isSuccess, rejectOpen, acceptStarted]);

  const acceptBusy =
    attestor.isPending || attestReceipt.isLoading || board.isPending || acceptReceipt.isLoading;

  const acceptError =
    attestor.error?.message ??
    attestReceipt.error?.message ??
    board.error?.message ??
    acceptReceipt.error?.message ??
    null;

  const acceptDone = acceptReceipt.isSuccess;

  // While "accept" is the user-initiated tx, "reject" shares board.hash —
  // we only show the reject status block when accept hasn't started.
  const rejectMode =
    !attestor.hash && !attestor.isPending && board.hash !== undefined && !acceptStarted;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <p className="text-sm text-[var(--color-kanbantic-fg)]/85">
        Review the submission, then accept (signs an attestation + releases escrow) or reject.
      </p>
      <AcceptStealthHint capabilities={claimerCapabilities} />
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <button
          type="button"
          onClick={() => {
            setModalOpen(true);
          }}
          disabled={acceptBusy || acceptDone}
          className={cn(
            "min-h-11 rounded-md px-4 py-2 text-sm font-semibold transition-opacity",
            "bg-[var(--color-kanbantic-accent)] text-[var(--color-kanbantic-bg)]",
            "disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:opacity-90",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-kanbantic-accent)]",
          )}
        >
          {acceptDone ? "Accepted" : "Accept"}
        </button>
        <button
          type="button"
          onClick={() => {
            setRejectOpen(true);
          }}
          disabled={acceptBusy || acceptDone || board.isPending}
          className={cn(
            "min-h-11 rounded-md border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-300",
            "hover:enabled:bg-red-500/10",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400",
          )}
        >
          Reject
        </button>
      </div>

      {rejectMode ? (
        <TxStatusBlock
          hash={board.hash}
          pending={board.isPending}
          isConfirming={acceptReceipt.isLoading}
          isConfirmed={acceptReceipt.isSuccess}
          errorMessage={board.error?.message ?? acceptReceipt.error?.message ?? null}
          successCopy="Rejection confirmed."
        />
      ) : null}

      {!rejectMode && (attestor.hash !== undefined || acceptDone) ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
            Step 1 · Attestation
          </p>
          <TxStatusBlock
            hash={attestor.hash}
            pending={attestor.isPending}
            isConfirming={attestReceipt.isLoading}
            isConfirmed={attestReceipt.isSuccess}
            errorMessage={attestor.error?.message ?? attestReceipt.error?.message ?? null}
            successCopy="Attestation confirmed."
          />
          {attestReceipt.isSuccess ? (
            <>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
                Step 2 · Accept
              </p>
              <TxStatusBlock
                hash={board.hash}
                pending={board.isPending}
                isConfirming={acceptReceipt.isLoading}
                isConfirmed={acceptReceipt.isSuccess}
                errorMessage={board.error?.message ?? acceptReceipt.error?.message ?? null}
                successCopy="Bounty accepted — payout released."
              />
            </>
          ) : null}
        </div>
      ) : null}

      {modalOpen ? (
        <AttestationModal
          bountyId={bounty.id}
          onClose={() => {
            if (!acceptBusy) setModalOpen(false);
          }}
          onSubmit={onAttestSubmit}
          busy={acceptBusy}
          statusSlot={
            acceptError !== null ? (
              <div
                role="alert"
                className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
              >
                {acceptError}
              </div>
            ) : attestor.hash !== undefined ? (
              <div className="text-xs text-[var(--color-kanbantic-muted)]">
                Attestation tx submitted — accept will fire automatically once it confirms.
              </div>
            ) : null
          }
        />
      ) : null}

      {rejectOpen ? (
        <RejectModal
          bountyId={bounty.id}
          onClose={() => {
            if (!board.isPending && !acceptReceipt.isLoading) setRejectOpen(false);
          }}
          onSubmit={onRejectSubmit}
          busy={board.isPending || acceptReceipt.isLoading}
          statusSlot={
            board.error !== null ? (
              <div
                role="alert"
                className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
              >
                {board.error.message}
              </div>
            ) : board.hash !== undefined ? (
              <div className="text-xs text-[var(--color-kanbantic-muted)]">
                Reject tx submitted — close once it confirms.
              </div>
            ) : null
          }
        />
      ) : null}
    </section>
  );
}
