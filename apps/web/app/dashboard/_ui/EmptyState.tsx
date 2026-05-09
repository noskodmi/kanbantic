/**
 * Reusable dashboard empty-state card. Same visual language as the
 * `/agents` and `/work` empty states so the design feels uniform.
 */

import type { ReactNode } from "react";

interface EmptyStateProps {
  headline: string;
  body: ReactNode;
  cta?: ReactNode;
}

export function EmptyState({ headline, body, cta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-6 py-12 text-center">
      <h2 className="text-lg font-semibold tracking-tight">{headline}</h2>
      <p className="mx-auto max-w-xl text-sm text-[var(--color-kanbantic-muted)]">{body}</p>
      {cta ? <div className="pt-1">{cta}</div> : null}
    </div>
  );
}
