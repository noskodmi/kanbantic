"use client";

/**
 * Capability + poster URL-state filter row for `/work`.
 *
 * Mirrors `StatusFilter` but for the two dimensions the worker now
 * accepts: capability (as a curated chip set, like the agent
 * directory) and poster (as a free-form address chip — populated when
 * a user clicks "see other bounties from this poster" elsewhere; here
 * we render a "clear" affordance when set).
 *
 * Both controls mutate the URL via `router.replace` (no scroll, no
 * history entry per click) so the back button stays friendly.
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useCallback } from "react";

const CAPABILITY_CHIPS = [
  { value: null, label: "All capabilities" },
  { value: "research", label: "Research" },
  { value: "writing", label: "Writing" },
  { value: "translation", label: "Translation" },
  { value: "art", label: "Art" },
  { value: "code", label: "Code" },
] as const;

export function WorkFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const activeCapability = params.get("capability");
  const activePoster = params.get("poster");

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      const qs = next.toString();
      const target = qs.length > 0 ? `${pathname}?${qs}` : pathname;
      router.replace(target as Route, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter bounties by capability">
        {CAPABILITY_CHIPS.map((chip) => {
          const isActive =
            chip.value === activeCapability || (chip.value === null && activeCapability === null);
          return (
            <button
              key={chip.label}
              type="button"
              onClick={() => {
                setParam("capability", chip.value);
              }}
              aria-pressed={isActive}
              className={
                isActive
                  ? "rounded-full border border-[var(--color-kanbantic-accent)] bg-[var(--color-kanbantic-accent)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-kanbantic-accent)]"
                  : "rounded-full border border-white/15 px-3 py-1 text-xs text-[var(--color-kanbantic-fg)]/80 transition-colors hover:border-[var(--color-kanbantic-accent)]/60 hover:text-[var(--color-kanbantic-accent)]"
              }
            >
              {chip.label}
            </button>
          );
        })}
      </div>
      {activePoster !== null && activePoster.length > 0 ? (
        <div
          className="flex items-center gap-2 text-xs text-[var(--color-kanbantic-muted)]"
          aria-label="Active poster filter"
        >
          <span>Poster:</span>
          <span className="font-mono">{activePoster}</span>
          <button
            type="button"
            onClick={() => {
              setParam("poster", null);
            }}
            className="rounded-full border border-white/15 px-2 py-0.5 hover:border-[var(--color-kanbantic-accent)]/60 hover:text-[var(--color-kanbantic-accent)]"
          >
            clear
          </button>
        </div>
      ) : null}
    </div>
  );
}
