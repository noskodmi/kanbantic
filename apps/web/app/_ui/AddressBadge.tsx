"use client";

import { useState } from "react";

import { etherscanAddress, truncateAddress } from "../_lib/format";

interface AddressBadgeProps {
  address: string;
  /** When true, also renders an "Etherscan ↗" link next to the badge. */
  showEtherscan?: boolean;
}

export function AddressBadge({ address, showEtherscan = false }: AddressBadgeProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1200);
    } catch {
      // Clipboard not available (e.g. non-secure context); silently no-op.
    }
  }

  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs">
      <button
        type="button"
        onClick={() => {
          void handleCopy();
        }}
        title={`Copy ${address}`}
        className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[var(--color-kanbantic-fg)]/90 transition-colors hover:border-[var(--color-kanbantic-accent)]/60 hover:text-[var(--color-kanbantic-accent)]"
      >
        {truncateAddress(address)}
      </button>
      {copied ? <span className="text-[var(--color-kanbantic-accent)]">copied</span> : null}
      {showEtherscan ? (
        <a
          href={etherscanAddress(address)}
          target="_blank"
          rel="noreferrer noopener"
          className="text-[var(--color-kanbantic-muted)] hover:text-[var(--color-kanbantic-accent)]"
        >
          Etherscan ↗
        </a>
      ) : null}
    </span>
  );
}
