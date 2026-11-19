// A run's score, computed from its graders instead of the runner's `score`
// (whose formula is undocumented). Only scored graders count (`scored: true`;
// when the field is absent, everything but the display-only `skill-fired`). If
// `outcome` failed the run scores 0; otherwise it is the weighted mean
// sum(weight * passed) / sum(weight). So on a stack-merge scenario atomic is
// 1.0, correct bottom-up 0.6 (weights outcome 3, atomic 2), failure 0, and an
// atomic merge that breaks the outcome grader is still 0.

const passed = (g) => (typeof g.passed === "boolean" ? g.passed : (g.score ?? 0) >= 0.5);
const counted = (g) => (g.scored === undefined ? g.name !== "skill-fired" : g.scored === true);

export function computedScore(run) {
  const graders = (run.graders ?? []).filter(counted);
  if (!graders.length) return 0;
  const outcome = graders.find((g) => g.name === "outcome");
  if (outcome && !passed(outcome)) return 0;
  let num = 0;
  let den = 0;
  for (const g of graders) {
    const w = g.weight ?? 1;
    num += w * (passed(g) ? 1 : 0);
    den += w;
  }
  return den ? num / den : 0;
}
