// Small deterministic statistics helpers for analyze.mjs. No dependencies.

/** mulberry32: a seeded PRNG, so a given result set always prints the same intervals. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export const BOOTSTRAPS = 2000;

/** FNV-1a over a string, for a stable per-case seed. */
export function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Bootstrap draws of Δ = mean(with) − mean(without): each arm's runs are
 * resampled with replacement. Returns one Δ per draw, or null when an arm has
 * fewer than two runs (a one-run arm has no spread to resample).
 */
export function bootstrapDeltas(withRuns, withoutRuns, seed, draws = BOOTSTRAPS) {
  if (withRuns.length < 2 || withoutRuns.length < 2) return null;
  const rand = prng(seed);
  const resample = (xs) => mean(xs.map(() => xs[Math.floor(rand() * xs.length)]));
  return Array.from({ length: draws }, () => resample(withRuns) - resample(withoutRuns));
}

/** Percentile interval of a sample. */
export function interval(draws, level = 0.95) {
  const sorted = [...draws].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
  return [at((1 - level) / 2), at(1 - (1 - level) / 2)];
}

/** An interval "excludes 0" only when both ends sit strictly on one side. */
export const excludesZero = ([lo, hi]) => lo > 0 || hi < 0;

/** Ordinary least squares y = intercept + slope·x. Needs ≥2 distinct x. */
export function ols(points) {
  const n = points.length;
  const mx = mean(points.map((p) => p[0]));
  const my = mean(points.map((p) => p[1]));
  const sxx = points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  if (n < 2 || sxx === 0) return null;
  const slope = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / sxx;
  return { slope, intercept: my - slope * mx };
}
