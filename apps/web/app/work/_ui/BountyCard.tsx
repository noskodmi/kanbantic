/**
 * Single bounty row in the `/work` browse grid.
 *
 * Server-renderable: pure presentational component. The whole card is a Link
 * to `/work/[id]` so the row is a single click target. The claimer link (when
 * present) is a separate element — to keep nested-anchor semantics clean we
 * render the claimer label as a non-interactive pill on the card itself, and
 * users navigate to the agent profile from inside the bounty detail page.
 */

import Link from "next/link";
import type { Route } from "next";
import type { BountySummary } from "@kanbantic/shared";

import { truncateAddress } from "../../_lib/format.js";
import { formatEth, relativeTime } from "../_lib/format.js";
import { StatusPill } from "./StatusPill.js";

const ACTIVE_CLAIMER_STATUSES = new Set([
  "Claimed",
  "Submitted",
  "Resolved",
  "Disputed",
  "Refunded",
]);

interface BountyCardProps {
  bounty: BountySummary;
}

export function BountyCard({ bounty }: BountyCardProps) {
  const showClaimer = ACTIVE_CLAIMER_STATUSES.has(bounty.status) && bounty.claimer_address !== null;

  return (
    <Link
      href={`/work/${bounty.id}` as Route}
      className="group flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4 transition-colors hover:border-[var(--color-kanbantic-accent)]/60 hover:bg-white/[0.04]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-[var(--color-kanbantic-muted)]">#{bounty.id}</span>
          <span className="text-base font-semibold text-[var(--color-kanbantic-fg)] group-hover:text-[var(--color-kanbantic-accent)]">
            {bounty.capability}
          </span>
        </div>
        <StatusPill status={bounty.status} />
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-lg font-bold tabular-nums text-[var(--color-kanbantic-fg)]">
          {formatEth(bounty.reward)}
        </span>
        <span className="text-xs text-[var(--color-kanbantic-muted)]">
          posted {relativeTime(bounty.created_at_ts)}
        </span>
      </div>

      {showClaimer && bounty.claimer_address ? (
        <div className="flex items-center gap-2 overflow-hidden border-t border-white/10 pt-3 text-xs text-[var(--color-kanbantic-muted)]">
          <span className="shrink-0">claimed by</span>
          <span
            className="truncate rounded-md bg-white/5 px-2 py-0.5 font-mono text-[var(--color-kanbantic-fg)]/90"
            title={
              bounty.claimer_node !== null && bounty.claimer_node.length > 0
                ? bounty.claimer_node
                : bounty.claimer_address
            }
          >
            {bounty.claimer_label !== null &&
            bounty.claimer_label !== undefined &&
            bounty.claimer_label.length > 0
              ? `${bounty.claimer_label}.kanbantic.eth`
              : bounty.claimer_node !== null && bounty.claimer_node.length > 0
                ? `${bounty.claimer_node.slice(0, 10)}…${bounty.claimer_node.slice(-6)}`
                : truncateAddress(bounty.claimer_address)}
          </span>
        </div>
      ) : null}
    </Link>
  );
}
