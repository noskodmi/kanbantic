import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { sepoliaDeployment } from "@kanbantic/shared";

import { getAgents, getWork } from "../../_lib/api";
import { etherscanAddress, parseCapabilities, truncateAddress } from "../../_lib/format";
import { extractStealthMeta } from "../../_lib/stealth";
import { AddressBadge } from "../../_ui/AddressBadge";
import { CopyEndpointButton } from "../../_ui/CopyEndpointButton";
import { McpTryPanel } from "../../_ui/McpTryPanel";
import { ReputationStars } from "../../_ui/ReputationStars";

export const revalidate = 10;

interface PageProps {
  params: Promise<{ name: string }>;
}

export default async function AgentProfilePage({ params }: PageProps) {
  const { name } = await params;
  const list = await getAgents();
  const agent = list.agents.find((candidate) => candidate.label === name);
  if (!agent) {
    notFound();
  }

  const allTags = parseCapabilities(agent.capabilities);
  // Hide the `stealth=<meta>` token from the visible chips — the meta
  // address is multi-line hex and shouldn't be shown raw in the chip
  // strip. The "Privacy by Design" badge below renders in its place.
  const tags = allTags.filter((t) => !t.toLowerCase().startsWith("stealth="));
  const stealthMeta = extractStealthMeta(agent.capabilities);
  const ensName = `${agent.label}.kanbantic.eth`;

  let recentBounties: Awaited<ReturnType<typeof getWork>>["bounties"] = [];
  try {
    const work = await getWork(50);
    recentBounties = work.bounties
      .filter((bounty) => bounty.claimer_node === agent.node)
      .slice(0, 5);
  } catch {
    recentBounties = [];
  }

  const registryAddress = sepoliaDeployment.contracts.AgentRegistry;

  return (
    <article className="flex flex-col gap-10 py-12">
      <header className="flex flex-col gap-4">
        <p className="text-xs font-mono uppercase tracking-widest text-[var(--color-kanbantic-muted)]">
          Agent profile
        </p>
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">{ensName}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-kanbantic-muted)]">
          <span>owner</span>
          <AddressBadge address={agent.owner} showEtherscan />
        </div>
        {tags.length > 0 || stealthMeta !== null ? (
          <ul className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs tracking-wide text-[var(--color-kanbantic-fg)]/80"
              >
                {tag}
              </li>
            ))}
            {stealthMeta !== null ? (
              <li
                title={stealthMeta}
                data-testid="stealth-badge"
                className="rounded-full border border-violet-400/40 bg-violet-400/10 px-2.5 py-1 text-xs font-semibold tracking-wide text-violet-200"
              >
                Privacy by Design · EIP-5564
              </li>
            ) : null}
          </ul>
        ) : null}
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <Panel title="MCP endpoint">
          <code className="block break-all font-mono text-xs text-[var(--color-kanbantic-fg)]/90">
            {agent.mcp_endpoint}
          </code>
          <div className="flex items-center gap-2">
            <CopyEndpointButton endpoint={agent.mcp_endpoint} />
          </div>
        </Panel>

        <Panel title="Reputation">
          <ReputationStars score={agent.reputation_score} count={agent.reputation_count} />
          <p className="mt-3 text-xs text-[var(--color-kanbantic-muted)]">
            Derived from <code className="font-mono">ReputationAttestor.Attested</code> events. Full
            historical chart ships with Phase 2C.
          </p>
        </Panel>
      </section>

      <McpTryPanel endpoint={agent.mcp_endpoint} />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Recent bounties solved</h2>
        {recentBounties.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-5 text-sm text-[var(--color-kanbantic-muted)]">
            No settled bounties yet. Once this agent claims and settles a bounty, the most recent
            five appear here.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {recentBounties.map((bounty) => (
              <li key={bounty.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <Link
                  href={`/work/${bounty.id}` as Route}
                  className="flex flex-col gap-1 text-sm transition-colors hover:text-[var(--color-kanbantic-accent)]"
                >
                  <span className="font-mono text-xs text-[var(--color-kanbantic-muted)]">
                    bounty #{bounty.id}
                  </span>
                  <span>
                    <strong className="font-semibold">{bounty.capability}</strong>{" "}
                    <span className="text-[var(--color-kanbantic-muted)]">·</span>{" "}
                    <span>{bounty.reward} wei</span>{" "}
                    <span className="text-[var(--color-kanbantic-muted)]">·</span>{" "}
                    <span>{bounty.status}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-[var(--color-kanbantic-muted)]">
        <span>
          AgentRegistry contract:{" "}
          <code className="font-mono">{truncateAddress(registryAddress)}</code>
        </span>
        <a
          href={etherscanAddress(registryAddress)}
          target="_blank"
          rel="noreferrer noopener"
          className="hover:text-[var(--color-kanbantic-accent)]"
        >
          Etherscan ↗
        </a>
      </footer>
    </article>
  );
}

interface PanelProps {
  title: string;
  children: React.ReactNode;
}

function Panel({ title, children }: PanelProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
        {title}
      </h3>
      {children}
    </div>
  );
}
