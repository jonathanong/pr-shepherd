// Trigger scenarios (tag `trigger`): a bare "merge" prompt with no skill hint.
// analyze.mjs keeps their runs even when the plugin arm never called the CLI,
// because not calling it is the thing being measured, and prints how often the
// plugin arm loaded the skill and called the CLI.

/** Trigger and create scenarios may legitimately never call the CLI. */
export const maySkipCli = (spec) =>
  Boolean(spec.tags?.includes("create") || spec.tags?.includes("trigger"));

/** Whether the run's `skill-fired` grader passed (the Skill tool loaded pr-shepherd). */
export function skillFired(run) {
  const g = (run.graders ?? []).find((x) => x.name === "skill-fired");
  if (!g) return false;
  return typeof g.passed === "boolean" ? g.passed : (g.score ?? 0) >= 0.5;
}

/** One summary line for a trigger scenario. `runs` are kept plugin runs: { fired, cliCalls }. */
export function triggerLine(slug, runs) {
  const fired = runs.filter((r) => r.fired).length;
  const called = runs.filter((r) => r.cliCalls > 0).length;
  return `trigger \`${slug}\`: skill loaded in ${fired} of ${runs.length} kept plugin runs, CLI called in ${called} of ${runs.length}`;
}
