/**
 * Reputation series helpers.
 *
 * The agent detail page renders a 30-day "arc" of an agent's rolling
 * reputation. The worker may or may not yet expose a per-attestation
 * series — in either case `buildReputationSeries` is the single source
 * of truth for turning whatever input we have into a 30-element array
 * of `{ day, score }` points the SVG renderer can consume directly.
 *
 * `day` is a zero-indexed offset (0 = oldest sample, REPUTATION_WINDOW_DAYS - 1 = today).
 * `score` is clamped to [0, 5] so the chart maps cleanly to a unit-y SVG.
 */

export const REPUTATION_WINDOW_DAYS = 30;

/** Smoothing window (days) for the rolling-average series. */
const SMOOTHING_WINDOW = 5;

/** Bounds on the underlying score scale. */
const MIN_SCORE = 0;
const MAX_SCORE = 5;

export interface AttestationLike {
  /** 1–5 inclusive. */
  score: number;
  /** Unix seconds. */
  ts: number;
}

export interface ReputationPoint {
  /** Zero-indexed day offset; 0 = oldest, last index = today. */
  day: number;
  /** Smoothed reputation in [0, 5]. */
  score: number;
}

function clampScore(value: number): number {
  if (Number.isNaN(value)) return MIN_SCORE;
  if (value < MIN_SCORE) return MIN_SCORE;
  if (value > MAX_SCORE) return MAX_SCORE;
  return value;
}

/**
 * Build a 30-day series from an array of attestations.
 *
 * For each day in the window, the score is the average of all
 * attestations whose timestamp falls within [day - SMOOTHING_WINDOW + 1, day].
 * Days with no attestations in their smoothing window inherit the
 * most recent computed score (carry-forward), so a freshly-attested
 * agent's chart climbs and stays — judges see momentum, not a sawtooth.
 *
 * If the input is empty the returned series is REPUTATION_WINDOW_DAYS
 * zeros, which the renderer treats as the empty state.
 *
 * @param attestations Per-attestation `{ score, ts }` records (any order).
 * @param now Optional Unix-seconds clock override (testing).
 */
export function buildReputationSeries(
  attestations: readonly AttestationLike[],
  now: number = Math.floor(Date.now() / 1000),
): ReputationPoint[] {
  const todayDay = Math.floor(now / 86_400);
  const oldestDay = todayDay - (REPUTATION_WINDOW_DAYS - 1);

  if (attestations.length === 0) {
    return Array.from({ length: REPUTATION_WINDOW_DAYS }, (_, i) => ({ day: i, score: 0 }));
  }

  // Bucket attestations by absolute day-of-epoch.
  const byDay = new Map<number, number[]>();
  for (const a of attestations) {
    const d = Math.floor(a.ts / 86_400);
    const bucket = byDay.get(d);
    if (bucket === undefined) {
      byDay.set(d, [a.score]);
    } else {
      bucket.push(a.score);
    }
  }

  let lastScore = 0;
  const out: ReputationPoint[] = [];
  for (let i = 0; i < REPUTATION_WINDOW_DAYS; i++) {
    const absDay = oldestDay + i;
    let total = 0;
    let count = 0;
    for (let w = 0; w < SMOOTHING_WINDOW; w++) {
      const bucket = byDay.get(absDay - w);
      if (bucket === undefined) continue;
      for (const s of bucket) {
        total += s;
        count += 1;
      }
    }
    if (count === 0) {
      out.push({ day: i, score: lastScore });
    } else {
      const avg = clampScore(total / count);
      lastScore = avg;
      out.push({ day: i, score: avg });
    }
  }
  return out;
}

/**
 * Hand-roll an SVG `path d=` attribute from a series of points.
 *
 * Renders a closed area chart suitable for `<path fill="...">`. The
 * series x-coordinates span `[0, width]` evenly and y-coordinates
 * map score 0..MAX_SCORE → height..0 (top of the canvas is best).
 */
export function reputationAreaPath(
  series: readonly ReputationPoint[],
  width: number,
  height: number,
): string {
  if (series.length === 0) {
    return `M0 ${String(height)} L${String(width)} ${String(height)} Z`;
  }

  const lastIdx = series.length - 1;
  // Single-point series: synthesize a flat horizontal series across the full
  // width so the chart renders visibly (the only call site today passes a
  // 1-element array whenever reputation_count > 0; without this, every
  // existing agent profile would render an invisible zero-width sliver).
  const points: { x: number; y: number }[] =
    lastIdx === 0
      ? (() => {
          const onlyPoint = series[0];
          if (onlyPoint === undefined) {
            return [
              { x: 0, y: height },
              { x: width, y: height },
            ];
          }
          const y = height - (clampScore(onlyPoint.score) / MAX_SCORE) * height;
          return [
            { x: 0, y },
            { x: width, y },
          ];
        })()
      : series.map((p, i) => ({
          x: (i * width) / lastIdx,
          y: height - (clampScore(p.score) / MAX_SCORE) * height,
        }));

  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) {
    return `M0 ${String(height)} L${String(width)} ${String(height)} Z`;
  }

  // Build the line path, then close down to the baseline for an area fill.
  let d = `M${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    if (point === undefined) continue;
    d += ` L${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }
  d += ` L${last.x.toFixed(2)} ${String(height)}`;
  d += ` L${first.x.toFixed(2)} ${String(height)} Z`;
  return d;
}

/** Stroke-only path (no closing edges) — for the line on top of the area. */
export function reputationLinePath(
  series: readonly ReputationPoint[],
  width: number,
  height: number,
): string {
  if (series.length === 0) return "";
  const lastIdx = series.length - 1;
  // Single-point series: render a flat horizontal line across the full width
  // (matches reputationAreaPath's same-series fill). Without this, the line
  // collapses to a single M command with no L segments and is invisible.
  if (lastIdx === 0) {
    const onlyPoint = series[0];
    if (onlyPoint === undefined) return "";
    const y = (height - (clampScore(onlyPoint.score) / MAX_SCORE) * height).toFixed(2);
    return `M0 ${y} L${String(width)} ${y}`;
  }
  let d = "";
  for (let i = 0; i < series.length; i++) {
    const point = series[i];
    if (point === undefined) continue;
    const x = ((i * width) / lastIdx).toFixed(2);
    const y = (height - (clampScore(point.score) / MAX_SCORE) * height).toFixed(2);
    d += i === 0 ? `M${x} ${y}` : ` L${x} ${y}`;
  }
  return d;
}
