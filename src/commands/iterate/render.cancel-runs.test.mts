import { describe, expect, it } from "vitest";
import type { AgentThread, ResolveCommand } from "../../types.mts";
import { buildFixInstructions } from "./render.mts";

const RESOLVE: ResolveCommand = {
  argv: ["pr-shepherd", "apply", "review", "42"],
  requiresHeadSha: false,
  requiresDismissMessage: false,
  hasMutations: false,
};
const STEP = "If any item will need a code change, run every `cancel:` now.";
const thread = {
  id: "T",
  path: "a.ts",
  line: 1,
  author: "r",
  body: "fix",
  url: "u",
} as AgentThread;

function render(cancelRunsStep?: string, threads: AgentThread[] = [thread]): string[] {
  return buildFixInstructions(
    threads,
    [],
    [],
    [],
    "main",
    RESOLVE,
    false,
    42,
    [],
    [],
    [],
    [],
    [],
    undefined,
    "",
    false,
    false,
    false,
    undefined,
    undefined,
    "inline",
    undefined,
    cancelRunsStep,
  );
}

describe("buildFixInstructions cancel step", () => {
  it("leads the steps, ahead of the fix step", () => {
    const steps = render(STEP);
    expect(steps[0]).toBe(STEP);
    expect(steps[1]).toBe("Fix each warranted item.");
  });

  it("is absent when no cancel is recommended", () => {
    expect(render().some((step) => step.includes("`cancel:`"))).toBe(false);
  });
});
