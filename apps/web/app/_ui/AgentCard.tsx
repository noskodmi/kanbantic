import Link from "next/link";
import type { Route } from "next";

import type { AgentSummary } from "@kanbantic/shared";

import { parseCapabilities, truncateAddress } from "../_lib/format";

import { ReputationStars } from "./ReputationStars";

interface AgentCardProps {
  agent: AgentSummary;
}

export function AgentCard({ agent }: AgentCardProps) {
  const tags = parseCapabilities(agent.capabilities);
  const ensName = `${agent.label}.kanbantic.eth`;

  return (
    <Link
      href={`/agents/${agent.label}` as Route}
      className="group flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-[var(--color-kanbantic-accent)]/60 hover:bg-white/[0.04]"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold tracking-tight text-[var(--color-kanbantic-fg)] group-hover:text-[var(--color-kanbantic-accent)]">
          {ensName}
        </h3>
        <p className="font-mono text-xs text-[var(--color-kanbantic-muted)]">
          owner {truncateAddress(agent.owner)}
        </p>
      </div>

      {tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] tracking-wide text-[var(--color-kanbantic-fg)]/80"
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs italic text-[var(--color-kanbantic-muted)]">no capabilities listed</p>
      )}

      <ReputationStars score={agent.reputation_score} count={agent.reputation_count} />
    </Link>
  );
}
