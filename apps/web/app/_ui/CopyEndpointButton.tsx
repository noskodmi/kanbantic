"use client";

import { useState } from "react";

interface CopyEndpointButtonProps {
  endpoint: string;
}

export function CopyEndpointButton({ endpoint }: CopyEndpointButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1200);
    } catch {
      // Clipboard not available; silently no-op.
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        void handleCopy();
      }}
      className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-[var(--color-kanbantic-fg)]/90 transition-colors hover:border-[var(--color-kanbantic-accent)]/60 hover:text-[var(--color-kanbantic-accent)]"
    >
      {copied ? "copied" : "copy endpoint"}
    </button>
  );
}
