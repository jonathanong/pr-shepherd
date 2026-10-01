import { describe, expect, it } from "vitest";
import type { ResolveCommand } from "../../types.mts";
import { buildFixInstructions } from "./render.mts";

const RESOLVE: ResolveCommand = {
  argv: ["pr-shepherd", "apply", "review", "42"],
  requiresHeadSha: false,
  requiresDismissMessage: false,
  hasMutations: false,
};
const HINT = "rebase --force-with-lease";
const CONFLICT_HINT =
  "The branch conflicts with PR base branch `main`. rebase --force-with-lease before pushing.";

function render(opts: {
  hasConflicts: boolean;
  isBehind?: boolean;
  hasExhaustedWorkflowRerun?: boolean;
  stackRebase?: string;
}): string[] {
  return buildFixInstructions(
    [],
    [],
    [],
    [],
    "main",
    RESOLVE,
    opts.hasConflicts,
    42,
    0,
    [],
    [],
    [],
    [],
    [],
    [],
    undefined,
    HINT,
    opts.isBehind ?? false,
    false,
    opts.hasExhaustedWorkflowRerun ?? false,
    opts.stackRebase,
  );
}

describe("buildFixInstructions branch-update hint", () => {
  it("places the configured hint directly after the conflict step", () => {
    const instructions = render({ hasConflicts: true });
    const conflictStep = instructions.findIndex((i) => i.startsWith("The branch has merge"));
    expect(instructions[conflictStep + 1]).toBe(CONFLICT_HINT);
    expect(instructions.filter((i) => i === CONFLICT_HINT)).toHaveLength(1);
  });

  it("omits the hint on a native stack layer that follows the gh-stack route", () => {
    const instructions = render({ hasConflicts: true, stackRebase: "Run `gh stack rebase`." });
    expect(instructions.join("\n")).not.toContain(HINT);
  });

  it("keeps the hint before the push step when workflow recovery replaces the conflict step", () => {
    const instructions = render({ hasConflicts: true, hasExhaustedWorkflowRerun: true });
    const hint = instructions.indexOf(CONFLICT_HINT);
    const push = instructions.findIndex((i) => i.startsWith("Commit any remaining conflict"));
    expect(hint).toBeGreaterThan(-1);
    expect(hint).toBeLessThan(push);
  });
});
