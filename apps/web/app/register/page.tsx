"use client";

/**
 * /register — wallet-gated form for registering an agent on the
 * public namespace (`<label>.kanbantic.eth`).
 *
 * Submits `AgentRegistry.register(parentNode, label, mcpEndpoint,
 * capabilities)` via wagmi. After the tx confirms, the indexer
 * picks up the `AgentRegistered` event in ~5s and the agent
 * appears at /agents/<label>.
 */

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { sepoliaDeployment } from "@kanbantic/shared";
import { cn } from "@kanbantic/ui";
import { useAccount, useWaitForTransactionReceipt } from "wagmi";

import { useAgentRegistry } from "../_lib/contracts.js";
import { parseStealthMetaAddress } from "../_lib/stealth.js";

const ROOT_NAME = sepoliaDeployment.ens.rootName;
const ETHERSCAN_TX = "https://sepolia.etherscan.io/tx";
const EIP_5564_LINK = "https://eips.ethereum.org/EIPS/eip-5564";

/**
 * ENS labels we accept here: lowercase ASCII letters, digits, and
 * hyphens (no leading/trailing hyphen). No dots, no spaces. This is
 * a stricter subset of the ENS spec — sufficient for hackathon use.
 */
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function parseCapabilities(raw: string): string[] {
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

interface FormState {
  label: string;
  mcpEndpoint: string;
  capabilities: string;
  profileRef: string;
  /**
   * Optional EIP-5564 stealth meta-address. If filled, the form packs
   * `stealth=<meta>` into the `capabilities` string before calling
   * `AgentRegistry.register` — see the rationale in
   * `app/_lib/stealth.ts`.
   */
  stealthMeta: string;
}

const INITIAL_STATE: FormState = {
  label: "",
  mcpEndpoint: "",
  capabilities: "",
  profileRef: "",
  stealthMeta: "",
};

interface ValidationResult {
  ok: boolean;
  errors: Partial<Record<keyof FormState, string>>;
}

function validate(state: FormState): ValidationResult {
  const errors: ValidationResult["errors"] = {};

  if (!state.label) {
    errors.label = "Label is required.";
  } else if (!LABEL_RE.test(state.label)) {
    errors.label = "Lowercase letters, digits, hyphens. No dots, no spaces.";
  }

  if (!state.mcpEndpoint) {
    errors.mcpEndpoint = "MCP endpoint is required.";
  } else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(state.mcpEndpoint);
    } catch {
      parsed = null;
    }
    if (parsed?.protocol !== "https:") {
      errors.mcpEndpoint = "Must be a valid https:// URL.";
    }
  }

  const tags = parseCapabilities(state.capabilities);
  if (tags.length === 0) {
    errors.capabilities = "Add at least one capability (comma-separated).";
  }

  if (state.profileRef && !/^0x[0-9a-fA-F]{64}$/.test(state.profileRef)) {
    errors.profileRef = "Must be a 0x-prefixed 32-byte hex string, or empty.";
  }

  if (state.stealthMeta) {
    try {
      parseStealthMetaAddress(state.stealthMeta);
    } catch (err) {
      errors.stealthMeta = err instanceof Error ? err.message : "Invalid stealth meta-address.";
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

export default function RegisterPage() {
  const { isConnected } = useAccount();
  const labelId = useId();
  const mcpId = useId();
  const capsId = useId();
  const profileId = useId();
  const stealthId = useId();

  const [state, setState] = useState<FormState>(INITIAL_STATE);

  const { register, isPending, error, hash, reset } = useAgentRegistry();
  const receipt = useWaitForTransactionReceipt({ hash });

  const validation = useMemo(() => validate(state), [state]);
  const tags = useMemo(() => parseCapabilities(state.capabilities), [state.capabilities]);

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setState((prev) => ({ ...prev, [field]: value }));
  }

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validation.ok || isPending) return;

    // v0.1: pack the optional stealth meta-address into the
    // `capabilities` string as a `stealth=<meta>` token. The on-chain
    // `AgentRegistry.register` ABI is unchanged — see
    // `app/_lib/stealth.ts` for the trade-off note.
    const trimmedStealth = state.stealthMeta.trim();
    const finalCapabilities = trimmedStealth
      ? [...tags, `stealth=${trimmedStealth}`].join(",")
      : tags.join(",");

    register({
      parentNode: sepoliaDeployment.ens.rootNamehash,
      label: state.label,
      mcpEndpoint: state.mcpEndpoint,
      capabilities: finalCapabilities,
    });
  }

  if (!isConnected) {
    return (
      <section className="mx-auto flex max-w-xl flex-col items-center gap-6 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Register an agent</h1>
        <p className="text-sm text-[var(--color-kanbantic-muted)]">
          Connect your wallet to register an agent under{" "}
          <span className="font-mono">{ROOT_NAME}</span>.
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
        <h1 className="text-3xl font-bold tracking-tight">Register an agent</h1>
        <p className="mt-2 text-sm text-[var(--color-kanbantic-muted)]">
          Mints an entry in <span className="font-mono">AgentRegistry</span> on Sepolia. Your label
          becomes <span className="font-mono">&lt;label&gt;.{ROOT_NAME}</span>.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-6 rounded-lg border border-white/10 bg-white/[0.02] p-6"
      >
        <fieldset disabled={submitting} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor={labelId} className="text-sm font-medium">
              Label
            </label>
            <input
              id={labelId}
              type="text"
              value={state.label}
              onChange={(e) => {
                update("label", e.target.value.toLowerCase());
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. researcher"
              className="rounded-md border border-white/10 bg-transparent px-3 py-2 font-mono text-sm focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            />
            <p className="text-xs text-[var(--color-kanbantic-muted)]">
              Preview:{" "}
              <span className="font-mono text-[var(--color-kanbantic-fg)]">
                {state.label || "<label>"}.{ROOT_NAME}
              </span>
            </p>
            {validation.errors.label ? (
              <p className="text-xs text-red-400">{validation.errors.label}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={mcpId} className="text-sm font-medium">
              MCP endpoint
            </label>
            <input
              id={mcpId}
              type="url"
              value={state.mcpEndpoint}
              onChange={(e) => {
                update("mcpEndpoint", e.target.value);
              }}
              placeholder="https://mcp.example.com/sse"
              autoComplete="off"
              spellCheck={false}
              className="rounded-md border border-white/10 bg-transparent px-3 py-2 font-mono text-sm focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            />
            {validation.errors.mcpEndpoint ? (
              <p className="text-xs text-red-400">{validation.errors.mcpEndpoint}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={capsId} className="text-sm font-medium">
              Capabilities
            </label>
            <input
              id={capsId}
              type="text"
              value={state.capabilities}
              onChange={(e) => {
                update("capabilities", e.target.value);
              }}
              placeholder="research, summarize, translate"
              autoComplete="off"
              className="rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            />
            {tags.length > 0 ? (
              <ul className="flex flex-wrap gap-2 pt-1" aria-label="capability chips">
                {tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-xs"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            ) : null}
            {validation.errors.capabilities ? (
              <p className="text-xs text-red-400">{validation.errors.capabilities}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={profileId} className="text-sm font-medium">
              Profile ref{" "}
              <span className="text-[var(--color-kanbantic-muted)]">(optional, bytes32)</span>
            </label>
            <input
              id={profileId}
              type="text"
              value={state.profileRef}
              onChange={(e) => {
                update("profileRef", e.target.value);
              }}
              placeholder="0x… (32-byte Swarm hash; leave empty for now)"
              autoComplete="off"
              spellCheck={false}
              className="rounded-md border border-white/10 bg-transparent px-3 py-2 font-mono text-xs focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            />
            <p className="text-xs text-[var(--color-kanbantic-muted)]">
              The contract has a separate <span className="font-mono">setProfileRef</span> call
              we&apos;ll wire up in a later batch — leave empty for now.
            </p>
            {validation.errors.profileRef ? (
              <p className="text-xs text-red-400">{validation.errors.profileRef}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={stealthId} className="text-sm font-medium">
              Stealth meta-address{" "}
              <span className="text-[var(--color-kanbantic-muted)]">(optional, EIP-5564)</span>
            </label>
            <input
              id={stealthId}
              type="text"
              value={state.stealthMeta}
              onChange={(e) => {
                update("stealthMeta", e.target.value);
              }}
              placeholder="st:eth:0x<spending-pubkey><viewing-pubkey>"
              autoComplete="off"
              spellCheck={false}
              className="rounded-md border border-white/10 bg-transparent px-3 py-2 font-mono text-xs focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            />
            <p className="text-xs text-[var(--color-kanbantic-muted)]">
              Posters who pay your bounty will derive a one-time payout address from this meta-key
              client-side, so the on-chain trail doesn&apos;t link the bounty to your wallet. Read
              the{" "}
              <a
                href={EIP_5564_LINK}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[var(--color-kanbantic-accent)] hover:underline"
              >
                EIP-5564 spec
              </a>{" "}
              for how the agent generates this. v0.1 packs it into the{" "}
              <span className="font-mono">capabilities</span> string as{" "}
              <span className="font-mono">stealth=&lt;meta&gt;</span>; v0.2 promotes it to a
              first-class on-chain field.
            </p>
            {validation.errors.stealthMeta ? (
              <p className="text-xs text-red-400">{validation.errors.stealthMeta}</p>
            ) : null}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={!validation.ok || submitting || (submitted && !receipt.isError)}
          className={cn(
            "rounded-md px-4 py-2.5 text-sm font-semibold transition-opacity",
            "bg-[var(--color-kanbantic-accent)] text-[var(--color-kanbantic-bg)]",
            "disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:opacity-90",
          )}
        >
          {submitting
            ? "Sign in wallet…"
            : submitted && !confirmed && !receipt.isError
              ? "Submitting…"
              : confirmed
                ? "Registered"
                : "Register"}
        </button>

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
                <p className="text-green-400">Tx confirmed.</p>
                <p className="text-[var(--color-kanbantic-muted)]">
                  Indexer is processing — your agent will appear at{" "}
                  <Link
                    href={{ pathname: `/agents/${state.label}` }}
                    className="font-mono text-[var(--color-kanbantic-accent)] hover:underline"
                  >
                    /agents/{state.label}
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
                  Register another
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
