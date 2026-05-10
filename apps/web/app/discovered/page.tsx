import type { DiscoveredAgentsResponse } from "@kanbantic/shared";

import { getDiscovered } from "../_lib/api";

export const revalidate = 30;

export default async function DiscoveredPage() {
  let data: DiscoveredAgentsResponse | null = null;
  let fetchError: string | null = null;

  try {
    data = await getDiscovered(100);
  } catch (err: unknown) {
    fetchError = err instanceof Error ? err.message : "unknown error";
  }

  return (
    <section className="flex flex-col gap-8 py-12">
      <header className="flex flex-col gap-3">
        <p className="text-xs font-mono uppercase tracking-widest text-[var(--color-kanbantic-muted)]">
          Apify discovery
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Discovered MCP repos</h1>
        <p className="max-w-2xl text-sm text-[var(--color-kanbantic-muted)]">
          Repos surfaced by the <code className="font-mono">@kanbantic/apify-discoverer</code> Actor
          scanning GitHub Code Search for <code className="font-mono">mcp.json</code> /{" "}
          <code className="font-mono">mcp-server.&#123;ts,py&#125;</code>. Authors can claim a
          reserved <code className="font-mono">&lt;label&gt;.kanbantic.eth</code> in one Sepolia tx
          — the chain is the source of truth.
        </p>
      </header>

      {fetchError ? (
        <EmptyState
          headline="Discovery feed offline."
          body={
            <>
              The Kanbantic indexer didn&apos;t respond ({fetchError}). Discovery is an opt-in
              feature — the worker may not have{" "}
              <code className="font-mono">APIFY_WEBHOOK_SECRET</code> wired yet.
            </>
          }
        />
      ) : data && data.discovered.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {data.discovered.map((row) => (
            <li
              key={row.repo_url}
              className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col gap-1.5">
                <a
                  href={row.repo_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="break-all font-mono text-sm text-[var(--color-kanbantic-fg)] hover:text-[var(--color-kanbantic-accent)]"
                >
                  {row.repo_url.replace(/^https:\/\/github\.com\//, "")}
                </a>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-kanbantic-muted)]">
                  <span>
                    suggested:{" "}
                    <span className="font-mono text-[var(--color-kanbantic-fg)]/90">
                      {row.suggested_label}.kanbantic.eth
                    </span>
                  </span>
                  {row.mcp_path ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        signal: <code className="font-mono">{row.mcp_path}</code>
                      </span>
                    </>
                  ) : null}
                  <span aria-hidden="true">·</span>
                  <StatusPill status={row.status} />
                </div>
              </div>

              {row.status === "discovered" ? (
                <a
                  href={`/register?label=${encodeURIComponent(row.suggested_label)}`}
                  className="inline-flex items-center justify-center rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] hover:opacity-90"
                >
                  Claim →
                </a>
              ) : row.status === "claimed" ? (
                <a
                  href={`/agents/${row.suggested_label}`}
                  className="inline-flex items-center justify-center rounded-md border border-white/10 px-4 py-2 text-sm text-[var(--color-kanbantic-fg)]/80 hover:border-[var(--color-kanbantic-accent)] hover:text-[var(--color-kanbantic-accent)]"
                >
                  View agent
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          headline="No discoveries yet."
          body={
            <>
              The Apify Actor hasn&apos;t posted any candidates. Trigger a run from the Apify
              console (or wait for the next cron) and refresh this page.
            </>
          }
        />
      )}
    </section>
  );
}

interface StatusPillProps {
  status: "discovered" | "claimed" | "rejected";
}

function StatusPill({ status }: StatusPillProps) {
  const cls =
    status === "claimed"
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
      : status === "rejected"
        ? "border-red-400/40 bg-red-400/10 text-red-200"
        : "border-white/15 bg-white/5 text-[var(--color-kanbantic-fg)]/80";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${cls}`}
    >
      {status}
    </span>
  );
}

interface EmptyStateProps {
  headline: string;
  body: React.ReactNode;
}

function EmptyState({ headline, body }: EmptyStateProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
      <h2 className="text-lg font-semibold tracking-tight">{headline}</h2>
      <p className="mx-auto max-w-xl text-sm text-[var(--color-kanbantic-muted)]">{body}</p>
    </div>
  );
}
