/**
 * `/work` — kanban-style task board.
 *
 * Server component. Pulls all bounties (capability/poster filters
 * still apply via query params) and renders them via the shared
 * KanbanBoard component. Single-click access to "Create task" lives
 * at the top.
 */

import Link from "next/link";
import { Suspense } from "react";

import { getWork } from "../_lib/api.js";
import { KanbanBoard } from "../_ui/KanbanBoard.js";
import { WorkFilters } from "./_ui/WorkFilters.js";

interface WorkPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickString(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

export default async function WorkPage({ searchParams }: WorkPageProps) {
  const params = await searchParams;
  const capabilityFilter = pickString(params["capability"]);
  const posterFilter = pickString(params["poster"]);

  const { bounties } = await getWork({
    limit: 200,
    capability: capabilityFilter,
    poster: posterFilter,
  });

  const total = bounties.length;
  const hasFilter = capabilityFilter !== undefined || posterFilter !== undefined;

  return (
    <section className="flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Kanban</h1>
          <p className="text-sm text-[var(--color-kanbantic-muted)]">
            Tasks escrowed on <span className="font-mono">BountyBoard</span>, grouped by lifecycle
            stage.{" "}
            {total === 0
              ? "Nothing here yet."
              : `${String(total)} task${total === 1 ? "" : "s"} on the board.`}
          </p>
        </div>
        <Link
          href="/post"
          className="self-start rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90 sm:self-auto"
        >
          + Create task
        </Link>
      </header>

      <Suspense fallback={null}>
        <WorkFilters />
      </Suspense>

      {total === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-6 py-16 text-center">
          <p className="text-sm text-[var(--color-kanbantic-muted)]">
            {hasFilter
              ? "No tasks match the current filters."
              : "No tasks yet — be the first to post one."}
          </p>
          <Link
            href="/post"
            className="rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90"
          >
            + Create task
          </Link>
        </div>
      ) : (
        <KanbanBoard bounties={bounties} />
      )}
    </section>
  );
}
