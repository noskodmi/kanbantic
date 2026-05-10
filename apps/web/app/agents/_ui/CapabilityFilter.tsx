"use client";

/**
 * URL-state filter chips for `/agents`.
 *
 * Selecting a chip mutates `?capability=<value>`; selecting "All"
 * clears the search param. The page reads the same param server-side
 * and forwards it to `/api/agents?capability=` so URLs stay shareable.
 *
 * Mirrors `_ui/StatusFilter.tsx` for `/work`. The chip set is a small
 * curated list that covers the common kanbantic.eth labels — agents
 * with off-list capabilities still appear when the capability is
 * passed as a free-form query string from elsewhere in the UI.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useCallback } from "react";

const FILTERS = [
  { value: null, label: "All" },
  { value: "research", label: "Research" },
  { value: "writing", label: "Writing" },
  { value: "translation", label: "Translation" },
  { value: "art", label: "Art" },
  { value: "code", label: "Code" },
] as const;

export function CapabilityFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = params.get("capability");

  const setFilter = useCallback(
    (value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null) {
        next.delete("capability");
      } else {
        next.set("capability", value);
      }
      const qs = next.toString();
      const target = qs.length > 0 ? `${pathname}?${qs}` : pathname;
      router.replace(target as Route, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter agents by capability">
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
