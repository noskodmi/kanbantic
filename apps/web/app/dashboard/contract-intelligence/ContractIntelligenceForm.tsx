"use client";

/**
 * Contract Intelligence runner — client island.
 *
 * Form state lives entirely in the browser. On submit we POST the
 * chosen task + Sepolia address to the worker's
 * `/api/contract-intelligence/run` endpoint, then render the returned
 * markdown report inline.
 *
 * "Recent audits" is in-memory only for v0.1 — when the worker grows
 * a `contract_intelligence_runs` table we'll swap this for a server
 * fetch. The list shape (kind, address, sourcifyMatch, ranAt) is
 * already what the persisted row will carry.
 */

import { useState, type JSX, type SyntheticEvent } from "react";

import { Markdown } from "./Markdown.js";

const API_BASE: string = process.env["NEXT_PUBLIC_KANBANTIC_API"] ?? "http://localhost:8787";

const TASK_KINDS = ["audit", "explain", "similarity"] as const;
type TaskKind = (typeof TASK_KINDS)[number];

const TASK_LABEL: Record<TaskKind, string> = {
  audit: "Audit",
  explain: "Explain",
  similarity: "Similarity",
};

const TASK_HINT: Record<TaskKind, string> = {
  audit: "Severity-labeled findings with line citations.",
  explain: "Plain-English summary for a non-developer.",
  similarity: "Find verified contracts that look like this one (v0.2).",
};

interface RunResponse {
  kind?: TaskKind;
  address?: string;
  sourcifyMatch?: "exact_match" | "partial_match";
  report?: string;
  sourcifyUrl?: string;
  error?: string;
  message?: string;
}

type SourcifyMatchView = "exact_match" | "partial_match" | "none";

interface RecentRun {
  ranAt: number;
  kind: TaskKind;
  address: string;
  sourcifyMatch: SourcifyMatchView;
}

interface ContractIntelligenceFormProps {
  /** 5 Sepolia contracts the user can paste to try the demo. */
  sampleContracts: { name: string; address: string }[];
}

export function ContractIntelligenceForm({
  sampleContracts,
}: ContractIntelligenceFormProps): JSX.Element {
  const [address, setAddress] = useState("");
  const [taskKind, setTaskKind] = useState<TaskKind>("audit");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentRun[]>([]);

  async function runRequest(submittedKind: TaskKind, submittedAddress: string): Promise<void> {
    setLoading(true);
    setSubmitError(null);
    setResult(null);
    try {
      const response = await fetch(`${API_BASE}/api/contract-intelligence/run`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ taskKind: submittedKind, address: submittedAddress }),
      });
      const body = (await response.json()) as RunResponse;
      setResult(body);
      if (typeof body.error !== "string") {
        const recentEntry: RecentRun = {
          ranAt: Date.now(),
          kind: submittedKind,
          address: submittedAddress,
          sourcifyMatch: body.sourcifyMatch ?? "none",
        };
        setRecent((prev) => [recentEntry, ...prev].slice(0, 10));
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    void runRequest(taskKind, address.trim());
  }

  function reset(): void {
    setResult(null);
    setSubmitError(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="ci-address" className="text-sm font-medium">
            Sepolia contract address
          </label>
          <input
            id="ci-address"
            name="address"
            type="text"
            required
            placeholder="0x…"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
            }}
            spellCheck={false}
            autoComplete="off"
            className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 font-mono text-sm focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Task template</legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {TASK_KINDS.map((kind) => (
              <label
                key={kind}
                className={`flex flex-1 cursor-pointer flex-col gap-1 rounded-md border px-3 py-2 text-sm transition ${
                  taskKind === kind
                    ? "border-[var(--color-kanbantic-accent)] bg-[var(--color-kanbantic-accent)]/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/25"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="taskKind"
                    value={kind}
                    checked={taskKind === kind}
                    onChange={() => {
                      setTaskKind(kind);
                    }}
                  />
                  <span className="font-semibold">{TASK_LABEL[kind]}</span>
                </span>
                <span className="text-xs text-[var(--color-kanbantic-muted)]">
                  {TASK_HINT[kind]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading || address.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
                Running…
              </>
            ) : (
              `Run ${TASK_LABEL[taskKind]}`
            )}
          </button>
          {result || submitError ? (
            <button
              type="button"
              onClick={reset}
              className="text-xs text-[var(--color-kanbantic-muted)] underline hover:text-[var(--color-kanbantic-fg)]"
            >
              Run again with different task
            </button>
          ) : null}
        </div>

        {submitError ? (
          <p className="text-xs text-red-400" role="alert">
            {submitError}
          </p>
        ) : null}
      </form>

      {sampleContracts.length > 0 && !result && !loading ? (
        <aside className="rounded-md border border-dashed border-white/15 bg-white/[0.02] p-4 text-xs">
          <p className="mb-2 text-sm font-semibold">
            Try one of Kanbantic&apos;s 5 deployed contracts:
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {sampleContracts.map((c) => (
              <li key={c.address}>
                <button
                  type="button"
                  onClick={() => {
                    setAddress(c.address);
                  }}
                  className="w-full text-left font-mono text-[11px] text-[var(--color-kanbantic-accent)] hover:underline"
                >
                  {c.name}: {c.address}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      {result ? <ResultCard result={result} /> : null}

      {recent.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Recent audits (this session)</h3>
          <ul className="flex flex-col gap-1 text-xs">
            {recent.map((r) => (
              <li
                key={`${String(r.ranAt)}-${r.address}`}
                className="flex flex-wrap items-center gap-2 rounded border border-white/10 bg-white/[0.02] px-3 py-2"
              >
                <span className="font-semibold">{TASK_LABEL[r.kind]}</span>
                <span className="font-mono text-[var(--color-kanbantic-muted)]">{r.address}</span>
                <span className="ml-auto text-[var(--color-kanbantic-muted)]">
                  {r.sourcifyMatch}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ResultCard({ result }: { result: RunResponse }): JSX.Element {
  if (result.error) {
    return (
      <section className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
        <p className="font-semibold text-amber-300">{result.error.replace(/_/g, " ")}</p>
        <p className="mt-1 text-amber-100/80">{result.message ?? "No further detail."}</p>
      </section>
    );
  }

  const sourcifyUrl =
    result.sourcifyUrl ?? (result.address ? `https://sourcify.dev/lookup/${result.address}` : null);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <header className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] uppercase tracking-wide">
          {result.kind}
        </span>
        {result.sourcifyMatch ? (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
            Sourcify {result.sourcifyMatch.replace("_", " ")}
          </span>
        ) : null}
        {result.address ? (
          <span className="font-mono text-xs text-[var(--color-kanbantic-muted)]">
            {result.address}
          </span>
        ) : null}
      </header>

      {result.report ? (
        <article className="prose-invert max-w-none border-t border-white/10 pt-3">
          <Markdown source={result.report} />
        </article>
      ) : null}

      <footer className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3 text-xs">
        {sourcifyUrl ? (
          <a
            href={sourcifyUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[var(--color-kanbantic-accent)] hover:underline"
          >
            View on Sourcify ↗
          </a>
        ) : null}
        <span className="text-[var(--color-kanbantic-muted)]">
          Swarm artifact pending — uploads land when Sponsor 1&apos;s verified-fetch lib ships.
        </span>
      </footer>
    </section>
  );
}
