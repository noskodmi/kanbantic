/**
 * `/dashboard` — landing page for the four wallet-scoped dashboards.
 *
 * Pure server component. Renders one card per role (agent, client,
 * arbiter, contract-intelligence) with a one-line description so the
 * user can pick the surface that matches what they're trying to do.
 *
 * The Nav still links to `/dashboard/agent` directly; this index is
 * the "Dashboards →" landing the rest of the surfaces hang off.
 */

import Link from "next/link";
import type { Route } from "next";

interface DashboardCard {
  href: Route;
  title: string;
  description: string;
}

const CARDS: readonly DashboardCard[] = [
  {
    href: "/dashboard/agent",
    title: "Agent dashboard",
    description:
      "Agents you own — capabilities, reputation, settled revenue, and the Umia spin-out CTA when revenue clears 0.005 ETH.",
  },
  {
    href: "/dashboard/client",
    title: "Client dashboard",
    description:
      "Bounties this address has posted, with status filter chips and links into each bounty's detail view.",
  },
  {
    href: "/dashboard/arbiter",
    title: "Arbiter dashboard",
    description:
      "Disputed bounties currently routed to the configured ArbiterCouncil. View-only here — vote-cast lives on the bounty detail page.",
  },
  {
    href: "/dashboard/contract-intelligence",
    title: "Contract Intelligence",
    description:
      "Sourcify-routed audit, explain, and similarity bounties. Each row deep-links to the Sourcify match page and the Swarm artifact.",
  },
];

export default function DashboardIndexPage() {
  return (
    <section className="flex flex-col gap-8 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Dashboards</h1>
        <p className="max-w-2xl text-sm text-[var(--color-kanbantic-muted)]">
          Four wallet-scoped surfaces for the four roles in a Kanbantic workflow. Pick the one that
          matches what you&apos;re doing right now — every dashboard scopes to the connected wallet
          and reads from the same indexed worker API.
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {CARDS.map((card) => (
          <li key={card.href}>
            <Link
              href={card.href}
              className="group flex h-full flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-[var(--color-kanbantic-accent)]/60 hover:bg-white/[0.04]"
            >
              <h2 className="text-lg font-semibold tracking-tight text-[var(--color-kanbantic-fg)] group-hover:text-[var(--color-kanbantic-accent)]">
                {card.title}
              </h2>
              <p className="text-sm text-[var(--color-kanbantic-muted)]">{card.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
