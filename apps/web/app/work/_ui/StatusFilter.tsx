"use client";

/**
 * URL-state filter chips for `/work`.
 *
 * Selecting a chip mutates `?status=<value>`; selecting "All" clears the
 * search param. The page reads the same param server-side and filters the
 * bounty list before render, so the URL is always shareable.
 *
 * Uses `router.replace` (no scroll, no history entry per click) to keep the
 * back button friendly when users tab through chips.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useCallback } from "react";

const FILTERS = [
  { value: null, label: "All" },
  { value: "Open", label: "Open" },
  { value: "Claimed", label: "Claimed" },
  { value: "Resolved", label: "Resolved" },
  { value: "Disputed", label: "Disputed" },
] as const;

export function StatusFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = params.get("status");

  const setFilter = useCallback(
    (value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null) {
        next.delete("status");
      } else {
        next.set("status", value);
      }
      const qs = next.toString();
      const target = qs.length > 0 ? `${pathname}?${qs}` : pathname;
      router.replace(target as Route, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter bounties by status">
      {FILTERS.map((filter) => {
        const isActive = filter.value === active || (filter.value === null && active === null);
        return (
          <button
            key={filter.label}
            type="button"
            onClick={() => {
              setFilter(filter.value);
            }}
            aria-pressed={isActive}
            className={
              isActive
                ? "rounded-full border border-[var(--color-kanbantic-accent)] bg-[var(--color-kanbantic-accent)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-kanbantic-accent)]"
                : "rounded-full border border-white/15 px-3 py-1 text-xs text-[var(--color-kanbantic-fg)]/80 transition-colors hover:border-[var(--color-kanbantic-accent)]/60 hover:text-[var(--color-kanbantic-accent)]"
            }
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}
