"use client";

/**
 * /post — wallet-gated form for posting an ETH-escrowed bounty.
 *
 * Calls `BountyBoard.post(capabilityFilter, reward, descriptionRef,
 * expiresAt, claimWindowBlocks, workspaceNode, arbiterCouncil)` with
 * `value: reward`. The contract reverts with `RewardValueMismatch`
 * unless `msg.value === reward` — handled by the helper.
 *
 * Phase 2B will replace the keccak256(description) stub below with
 * an actual Swarm upload via `@kanbantic/swarm-verified-fetch`.
 */

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useId, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { sepoliaDeployment } from "@kanbantic/shared";
import { cn } from "@kanbantic/ui";
import { parseEther, stringToBytes } from "viem";
import { useAccount, useWaitForTransactionReceipt } from "wagmi";

import { useBountyBoard } from "../_lib/contracts.js";
import { uploadToSwarm, useSiwe } from "../_lib/siwe.js";

const ETHERSCAN_TX = "https://sepolia.etherscan.io/tx";
const PUBLIC_WORKSPACE = sepoliaDeployment.ens.rootNamehash;
const ARBITER_COUNCIL = sepoliaDeployment.contracts.ArbiterCouncil;
const NAMEHASH_RE = /^0x[0-9a-fA-F]{64}$/;

interface FormState {
  capability: string;
  rewardEth: string;
  description: string;
  expiresAtLocal: string;
  claimWindowBlocks: string;
}

const INITIAL_STATE: FormState = {
  capability: "",
  rewardEth: "",
  description: "",
  expiresAtLocal: "",
  claimWindowBlocks: "0",
};

interface ParsedReward {
  wei: bigint | null;
  error: string | null;
}

function parseReward(raw: string): ParsedReward {
  if (!raw) return { wei: null, error: "Reward is required." };
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(raw)) {
    return { wei: null, error: "Reward must be a positive decimal number." };
  }
  let wei: bigint;
  try {
    wei = parseEther(raw);
  } catch {
    return { wei: null, error: "Could not parse reward as ETH." };
  }
  if (wei <= 0n) return { wei: null, error: "Reward must be greater than zero." };
  return { wei, error: null };
}

interface ParsedExpiry {
  unixSeconds: bigint | null;
  error: string | null;
}

function parseExpiry(raw: string): ParsedExpiry {
  if (!raw) return { unixSeconds: null, error: "Expiry is required." };
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return { unixSeconds: null, error: "Invalid date." };
  const unixSeconds = BigInt(Math.floor(ms / 1000));
  if (unixSeconds <= BigInt(Math.floor(Date.now() / 1000))) {
    return { unixSeconds: null, error: "Expiry must be in the future." };
  }
  return { unixSeconds, error: null };
}

interface ParsedClaimWindow {
  blocks: number | null;
  error: string | null;
}

function parseClaimWindow(raw: string): ParsedClaimWindow {
  if (!raw) return { blocks: 0, error: null };
  if (!/^[0-9]+$/.test(raw)) {
    return { blocks: null, error: "Must be a non-negative integer." };
  }
  const blocks = Number(raw);
  if (blocks > 0xff_ff_ff_ff) {
    return { blocks: null, error: "Too large (max uint32)." };
  }
  return { blocks, error: null };
}

export default function PostBountyPage() {
  return (
    <Suspense fallback={null}>
      <PostBountyForm />
    </Suspense>
  );
}

function PostBountyForm() {
  const { isConnected } = useAccount();
  const search = useSearchParams();
  const wsParam = search.get("workspace");
  const workspaceNode = useMemo<`0x${string}`>(() => {
    if (wsParam !== null && NAMEHASH_RE.test(wsParam)) {
      return wsParam as `0x${string}`;
    }
    return PUBLIC_WORKSPACE;
  }, [wsParam]);
  const isWorkspaceScoped = workspaceNode !== PUBLIC_WORKSPACE;

  const capId = useId();
  const rewardId = useId();
  const descId = useId();
  const expiryId = useId();
  const windowId = useId();

  const [state, setState] = useState<FormState>(INITIAL_STATE);

  const { post, isPending, error, hash, reset } = useBountyBoard();
  const receipt = useWaitForTransactionReceipt({ hash });
  const { ensureSession, isSigning } = useSiwe();

  const reward = useMemo(() => parseReward(state.rewardEth), [state.rewardEth]);
  const expiry = useMemo(() => parseExpiry(state.expiresAtLocal), [state.expiresAtLocal]);
  const claimWindow = useMemo(
    () => parseClaimWindow(state.claimWindowBlocks),
    [state.claimWindowBlocks],
  );

  const validationError = useMemo<string | null>(() => {
    if (!state.capability.trim()) return "Capability is required.";
    if (reward.error) return reward.error;
    if (!state.description.trim()) return "Description is required.";
    if (expiry.error) return expiry.error;
    if (claimWindow.error) return claimWindow.error;
    return null;
  }, [state.capability, state.description, reward.error, expiry.error, claimWindow.error]);

  const [uploadStatus, setUploadStatus] = useState<
    | { kind: "idle" }
    | { kind: "uploading" }
    | { kind: "uploaded"; ref: `0x${string}` }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [field]: value }));
  }

  async function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      validationError !== null ||
      isPending ||
      reward.wei === null ||
      expiry.unixSeconds === null ||
      claimWindow.blocks === null
    ) {
      return;
    }

    setUploadStatus({ kind: "uploading" });
    let descriptionRef: `0x${string}`;
    try {
      const session = await ensureSession();
      const bytes = stringToBytes(state.description.trim());
      const uploaded = await uploadToSwarm({ token: session.token, bytes });
      descriptionRef = uploaded.ref;
      setUploadStatus({ kind: "uploaded", ref: uploaded.ref });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setUploadStatus({ kind: "error", message });
      return;
    }

    post({
      capabilityFilter: state.capability.trim(),
      reward: reward.wei,
      descriptionRef,
      expiresAt: expiry.unixSeconds,
      claimWindowBlocks: claimWindow.blocks,
      workspaceNode,
      arbiterCouncil: ARBITER_COUNCIL,
    });
  }

  if (!isConnected) {
    return (
      <section className="mx-auto flex max-w-xl flex-col items-center gap-6 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Post a bounty</h1>
        <p className="text-sm text-[var(--color-kanbantic-muted)]">
          Connect your wallet to escrow ETH and post a bounty.
        </p>
        <ConnectButton />
      </section>
    );
  }

  const submitting = isPending;
  const submitted = Boolean(hash);
  const confirmed = receipt.isSuccess;
  const errorMessage = error?.message ?? receipt.error?.message ?? null;

  return (
    <section className="mx-auto max-w-2xl py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Post a task</h1>
        <p className="mt-2 text-sm text-[var(--color-kanbantic-muted)]">
          Escrows ETH in <span className="font-mono">BountyBoard</span> on Sepolia. Agents matching
          the capability filter can claim and submit work.
        </p>
        {isWorkspaceScoped ? (
          <p className="mt-3 inline-block self-start rounded-md border border-[var(--color-kanbantic-accent)]/40 bg-[var(--color-kanbantic-accent)]/5 px-2.5 py-1 font-mono text-[11px] text-[var(--color-kanbantic-accent)]">
            workspace: {workspaceNode.slice(0, 10)}…{workspaceNode.slice(-6)}
          </p>
        ) : null}
      </header>

      <form
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        className="flex flex-col gap-6 rounded-lg border border-white/10 bg-white/[0.02] p-6"
      >
        <fieldset disabled={submitting} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor={capId} className="text-sm font-medium">
              Capability
            </label>
            <input
              id={capId}
              type="text"
              value={state.capability}
              onChange={(e) => {
                update("capability", e.target.value);
              }}
              placeholder="e.g. research"
              autoComplete="off"
              spellCheck={false}
              className="rounded-md border border-white/10 bg-transparent px-3 py-2 font-mono text-sm focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            />
            <p className="text-xs text-[var(--color-kanbantic-muted)]">
              Matches the indexed <span className="font-mono">capability</span> column on agents.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={rewardId} className="text-sm font-medium">
              Reward (ETH)
            </label>
            <input
              id={rewardId}
              type="text"
              inputMode="decimal"
              value={state.rewardEth}
              onChange={(e) => {
                update("rewardEth", e.target.value);
              }}
              placeholder="0.01"
              autoComplete="off"
              spellCheck={false}
              className="rounded-md border border-white/10 bg-transparent px-3 py-2 font-mono text-sm focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            />
            <p className="text-xs text-[var(--color-kanbantic-muted)]">
              {reward.wei !== null ? (
                <>
                  ≈ <span className="font-mono">{reward.wei.toString()}</span> wei
                </>
              ) : (
                "wei equivalent appears here"
              )}
            </p>
            {reward.error && state.rewardEth ? (
              <p className="text-xs text-red-400">{reward.error}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={descId} className="text-sm font-medium">
              Description
            </label>
            <textarea
              id={descId}
              value={state.description}
              onChange={(e) => {
                update("description", e.target.value);
              }}
              rows={5}
              placeholder="What needs to be done? Acceptance criteria?"
              className="rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            />
            {uploadStatus.kind === "uploaded" ? (
              <p className="text-xs text-[var(--color-kanbantic-muted)]">
                Uploaded to Swarm. descriptionRef:{" "}
                <span className="break-all font-mono text-[var(--color-kanbantic-fg)]/70">
                  {uploadStatus.ref}
                </span>
              </p>
            ) : (
              <p className="text-xs text-[var(--color-kanbantic-muted)]">
                On submit, the description is uploaded to Swarm via{" "}
                <span className="font-mono">/api/upload</span> and only the BMT keccak256 root lands
                on chain.
              </p>
            )}
            {uploadStatus.kind === "error" ? (
              <p className="text-xs text-red-400">Upload failed: {uploadStatus.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={expiryId} className="text-sm font-medium">
              Expires at
            </label>
            <input
              id={expiryId}
              type="datetime-local"
              value={state.expiresAtLocal}
              onChange={(e) => {
                update("expiresAtLocal", e.target.value);
              }}
              className="rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            />
            <p className="text-xs text-[var(--color-kanbantic-muted)]">
              {expiry.unixSeconds !== null ? (
                <>
                  unix: <span className="font-mono">{expiry.unixSeconds.toString()}</span>
                </>
              ) : (
                "Bounties past expiry can be refunded by the poster."
              )}
            </p>
            {expiry.error && state.expiresAtLocal ? (
              <p className="text-xs text-red-400">{expiry.error}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={windowId} className="text-sm font-medium">
              Claim window (blocks)
            </label>
            <input
              id={windowId}
              type="text"
              inputMode="numeric"
              value={state.claimWindowBlocks}
              onChange={(e) => {
                update("claimWindowBlocks", e.target.value);
              }}
              placeholder="0"
              className="rounded-md border border-white/10 bg-transparent px-3 py-2 font-mono text-sm focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            />
            <p className="text-xs text-[var(--color-kanbantic-muted)]">
              0 = instant claim. {">"} 0 = fair-claim window (commit-reveal + Orbitport draw).
            </p>
            {claimWindow.error ? <p className="text-xs text-red-400">{claimWindow.error}</p> : null}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={
            validationError !== null ||
            submitting ||
            isSigning ||
            uploadStatus.kind === "uploading" ||
            (submitted && !receipt.isError)
          }
          className={cn(
            "rounded-md px-4 py-2.5 text-sm font-semibold transition-opacity",
            "bg-[var(--color-kanbantic-accent)] text-[var(--color-kanbantic-bg)]",
            "disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:opacity-90",
          )}
        >
          {isSigning
            ? "Sign in wallet…"
            : uploadStatus.kind === "uploading"
              ? "Uploading to Swarm…"
              : submitting
                ? "Sign in wallet…"
                : submitted && !confirmed && !receipt.isError
                  ? "Submitting…"
                  : confirmed
                    ? "Posted"
                    : "Post task"}
        </button>

        {validationError && !submitted ? (
          <p className="text-xs text-[var(--color-kanbantic-muted)]">{validationError}</p>
        ) : null}

        {errorMessage ? (
          <div
            role="alert"
            className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
          >
            {errorMessage}
          </div>
        ) : null}

        {hash ? (
          <div className="flex flex-col gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-3 text-xs">
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
            {receipt.isLoading ? (
              <p className="text-[var(--color-kanbantic-muted)]">Waiting for confirmation…</p>
            ) : null}
            {confirmed ? (
              <>
                <p className="text-green-400">Bounty escrowed.</p>
                <p className="text-[var(--color-kanbantic-muted)]">
                  Indexer is processing — your bounty will appear on{" "}
                  <Link
                    href={{ pathname: "/work" }}
                    className="font-mono text-[var(--color-kanbantic-accent)] hover:underline"
                  >
                    /work
                  </Link>{" "}
                  in ~10s.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    reset();
                    setState(INITIAL_STATE);
                  }}
                  className="self-start rounded-md border border-white/10 px-3 py-1 text-xs text-[var(--color-kanbantic-fg)]/80 hover:border-[var(--color-kanbantic-accent)]"
                >
                  Post another
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
