/**
 * `/dashboard/contract-intelligence` — Sourcify-routed audit runner.
 *
 * Phase 7 v0.1: server-rendered shell that hands off to a client
 * island (`ContractIntelligenceForm`). The form POSTs to the worker's
 * `/api/contract-intelligence/run` endpoint, which fetches verified
 * source from Sourcify v2 and returns a markdown report.
 *
 * The 5 sample contracts below come from `sepoliaDeployment` so users
 * always have a paste-ready, Sourcify-verified address handy.
 *
 * Sponsor 2's hook: most Sourcify-bounty entries treat verified source
 * as a trust badge; Kanbantic routes real bounty payouts through the
 * Sourcify lookup, so verified source is load-bearing rather than
 * decorative. See spec §6 Sourcify subsection.
 */

import { sepoliaDeployment } from "@kanbantic/shared";

import { ContractIntelligenceForm } from "./ContractIntelligenceForm.js";

export const dynamic = "force-dynamic";

export default function ContractIntelligenceDashboardPage() {
  const sampleContracts = Object.entries(sepoliaDeployment.contracts).map(([name, address]) => ({
    name,
    address,
  }));

  return (
    <section className="flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Contract Intelligence</h1>
        <p className="max-w-2xl text-sm text-[var(--color-kanbantic-muted)]">
          Paste any Sepolia contract address verified on Sourcify. The runner picks{" "}
          <span className="font-mono">audit</span>, <span className="font-mono">explain</span>, or{" "}
          <span className="font-mono">similarity</span>, fetches verified source from Sourcify v2,
          and returns a report you can audit alongside the on-chain bytecode.
        </p>
      </header>

      <ContractIntelligenceForm sampleContracts={sampleContracts} />

      <footer className="rounded-md border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-[var(--color-kanbantic-muted)]">
        Why Contract Intelligence: Sourcify is load-bearing, not a checkbox. Kanbantic routes
        on-chain economic flow (bounty payouts) through verified-source lookups so audit findings
        stay anchored to bytecode-matching source. See spec §6 Sourcify section.
      </footer>
    </section>
  );
}
