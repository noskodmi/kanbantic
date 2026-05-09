/**
 * Shared shell for the wallet-scoped dashboards.
 *
 * Renders a page title + lede, then either a Connect prompt (if no
 * wallet is connected) or the supplied content. Pure presentational
 * — server-renderable — but the wagmi-aware client island is what
 * passes `walletConnected` in.
 */

import type { ReactNode } from "react";

interface DashboardLayoutProps {
  title: string;
  description: ReactNode;
  walletConnected: boolean;
  /** Slot for the wallet-connect button — typically a RainbowKit `<ConnectButton />`. */
  connectSlot: ReactNode;
  children: ReactNode;
}

export function DashboardLayout({
  title,
  description,
  walletConnected,
  connectSlot,
  children,
}: DashboardLayoutProps) {
  return (
    <section className="flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="max-w-2xl text-sm text-[var(--color-kanbantic-muted)]">{description}</p>
      </header>

      {walletConnected ? (
        children
      ) : (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-6 py-16 text-center">
          <p className="text-sm text-[var(--color-kanbantic-muted)]">
            Connect your wallet to see this dashboard.
          </p>
          {connectSlot}
        </div>
      )}
    </section>
  );
}
