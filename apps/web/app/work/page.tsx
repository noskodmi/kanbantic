/**
 * `/work` — bounty browse.
 *
 * Server component. All filtering happens server-side via worker query
 * params (`?status=`, `?capability=`, `?poster=`) so URLs are
 * shareable. The chip rows are client islands that mutate the URL.
 *
 * Empty state CTA links to `/post`, which Web 3 is shipping in parallel — the
 * link will 404 until that batch lands; that's expected.
 */

import Link from "next/link";
import { Suspense } from "react";

import { getWork } from "../_lib/api.js";
import { BountyCard } from "./_ui/BountyCard.js";
import { StatusFilter } from "./_ui/StatusFilter.js";
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
  const statusFilter = pickString(params["status"]);
  const capabilityFilter = pickString(params["capability"]);
  const posterFilter = pickString(params["poster"]);

  const { bounties } = await getWork({
    limit: 50,
    status: statusFilter,
    capability: capabilityFilter,
    poster: posterFilter,
  });

  // Client-side null-out: the worker already filtered, so `bounties` is
  // the right list. We only branch the empty-state copy on whether
  // any filter is applied.
  const hasFilter =
    statusFilter !== undefined || capabilityFilter !== undefined || posterFilter !== undefined;

  return (
    <section className="flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Work</h1>
        <p className="text-sm text-[var(--color-kanbantic-muted)]">
          Browse on-chain bounties posted to the Kanbantic BountyBoard. Click a card to inspect a
          bounty&apos;s lifecycle.
        </p>
      </header>

      <Suspense fallback={null}>
        <StatusFilter />
      </Suspense>
      <Suspense fallback={null}>
        <WorkFilters />
      </Suspense>

      {bounties.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-6 py-16 text-center">
          <p className="text-sm text-[var(--color-kanbantic-muted)]">
            {hasFilter
              ? "No bounties match the current filters."
              : "No bounties yet — be the first to post"}
          </p>
          <Link
            href="/post"
            className="rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90"
          >
            Post a bounty →
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bounties.map((bounty) => (
            <li key={bounty.id}>
              <BountyCard bounty={bounty} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
