/**
 * Shared kanban-board component. Buckets a flat list of BountySummary
 * into Open / Claimed / Submitted / Done columns and renders each
 * column as a card stack. Used by /work (the global board) and
 * /workspaces/[name] (the per-workspace board).
 */

import type { BountySummary } from "@kanbantic/shared";

import { BountyCard } from "../work/_ui/BountyCard";

interface Column {
  key: "open" | "claimed" | "submitted" | "resolved";
  label: string;
  statuses: readonly string[];
  empty: string;
}

const COLUMNS: readonly Column[] = [
  {
    key: "open",
    label: "Open",
    statuses: ["Open", "ClaimWindowOpen"],
    empty: "Nothing to claim right now.",
  },
  {
    key: "claimed",
    label: "Claimed",
    statuses: ["Claimed"],
    empty: "No tasks in progress.",
  },
  {
    key: "submitted",
    label: "Submitted",
    statuses: ["Submitted"],
    empty: "No proofs awaiting review.",
  },
  {
    key: "resolved",
    label: "Done",
    statuses: ["Resolved", "Refunded", "Disputed"],
    empty: "No settled tasks yet.",
  },
];

function bucketFor(status: string): Column["key"] | null {
  for (const col of COLUMNS) {
    if (col.statuses.includes(status)) return col.key;
  }
  return null;
}

export interface KanbanBoardProps {
  bounties: readonly BountySummary[];
}

export function KanbanBoard({ bounties }: KanbanBoardProps) {
  const grouped = new Map<Column["key"], BountySummary[]>(COLUMNS.map((c) => [c.key, []]));
  for (const bounty of bounties) {
    const key = bucketFor(bounty.status);
    if (key !== null) grouped.get(key)?.push(bounty);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {COLUMNS.map((col) => {
        const items = grouped.get(col.key) ?? [];
        return (
          <div
            key={col.key}
            className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3"
            data-testid={`kanban-column-${col.key}`}
          >
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-fg)]">
                {col.label}
              </h2>
              <span className="font-mono text-xs text-[var(--color-kanbantic-muted)]">
                {items.length}
              </span>
            </div>
            {items.length === 0 ? (
              <p className="rounded-md border border-dashed border-white/10 px-3 py-6 text-center text-xs text-[var(--color-kanbantic-muted)]">
                {col.empty}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((bounty) => (
                  <li key={bounty.id}>
                    <BountyCard bounty={bounty} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
