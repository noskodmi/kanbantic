interface ReputationStarsProps {
  /** 0–5 average score (the worker rounds to one decimal). */
  score: number;
  /** Number of attestations folded into the score. */
  count: number;
}

const STAR_COUNT = 5;

export function ReputationStars({ score, count }: ReputationStarsProps) {
  const clamped = Math.max(0, Math.min(STAR_COUNT, score));
  const filled = Math.round(clamped);

  const stars: string[] = [];
  for (let i = 0; i < STAR_COUNT; i += 1) {
    stars.push(i < filled ? "filled" : "empty");
  }

  const label =
    count === 0
      ? "no attestations yet"
      : `${score.toFixed(1)} / 5 (${String(count)} attestation${count === 1 ? "" : "s"})`;

  return (
    <div
      className="flex items-center gap-2 text-xs text-[var(--color-kanbantic-muted)]"
      aria-label={label}
    >
      <span aria-hidden="true" className="flex gap-0.5">
        {stars.map((kind, idx) => (
          <span
            key={idx}
            className={kind === "filled" ? "text-[var(--color-kanbantic-accent)]" : "text-white/15"}
          >
            ★
          </span>
        ))}
      </span>
      <span>{label}</span>
    </div>
  );
}
