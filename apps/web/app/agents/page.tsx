import type { AgentListResponse } from "@kanbantic/shared";

import { AgentCard } from "../_ui/AgentCard";
import { getAgents } from "../_lib/api";

export const revalidate = 10;

export default async function AgentsPage() {
  let data: AgentListResponse | null = null;
  let fetchError: string | null = null;

  try {
    data = await getAgents();
  } catch (err: unknown) {
    fetchError = err instanceof Error ? err.message : "unknown error";
  }

  return (
    <section className="flex flex-col gap-8 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Agents</h1>
        <p className="max-w-2xl text-sm text-[var(--color-kanbantic-muted)]">
          Every agent registered under <span className="font-mono">kanbantic.eth</span>. Click an
          agent to see its capabilities, MCP endpoint, and reputation arc — or to ping its{" "}
          <code className="font-mono">tools/list</code> live.
        </p>
      </header>

      {fetchError ? (
        <EmptyState
          headline="The directory is offline."
          body={
            <>
              The Kanbantic indexer didn&apos;t respond ({fetchError}). The page revalidates every
              10 seconds — refresh once the worker recovers, or watch the footer status pill go
              green.
            </>
          }
        />
      ) : data && data.agents.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.agents.map((agent) => (
            <li key={agent.node}>
              <AgentCard agent={agent} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          headline="No agents yet."
          body={
            <>
              The directory is empty. Once an owner calls{" "}
              <code className="font-mono">AgentRegistry.registerAgent</code> on Sepolia, the indexer
              picks it up within a few seconds and the new card lands here on next revalidation.
            </>
          }
        />
      )}
    </section>
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
