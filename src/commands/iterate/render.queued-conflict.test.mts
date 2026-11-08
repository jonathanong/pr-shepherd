import { describe, expect, it } from "vitest";
import type { ResolveCommand } from "../../types.mts";
import { buildFixInstructions } from "./render.mts";
import { QUEUED_CONFLICT_CONTINUATION } from "./native-stack-rebase.mts";

const RESOLVE: ResolveCommand = {
  argv: ["pr-shepherd", "apply", "review", "42"],
  requiresHeadSha: false,
  requiresDismissMessage: false,
  hasMutations: false,
};

function render(opts: {
  hasExhaustedWorkflowRerun?: boolean;
  stackRebase?: string;
  dequeueCommand?: string;
}): string[] {
  return buildFixInstructions(
    [],
    [],
    [],
    [],
    "main",
    RESOLVE,
    true,
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
    opts.hasExhaustedWorkflowRerun ?? false,
    opts.stackRebase,
    undefined,
    "inline",
    opts.dequeueCommand,
  );
}

describe("buildFixInstructions queued conflict", () => {
  it("makes the push path (a) and the final rerun path-aware", () => {
    const instructions = render({ dequeueCommand: "DEQUEUE" });
    expect(instructions[0]).toContain("first run `DEQUEUE`");
    expect(
      instructions.some((i) => i.startsWith("If you chose (a): Commit any remaining conflict")),
    ).toBe(true);
    expect(instructions.at(-1)).toBe(QUEUED_CONFLICT_CONTINUATION);
  });

  it("keeps the choice when workflow recovery replaces the conflict step", () => {
    const instructions = render({ dequeueCommand: "DEQUEUE", hasExhaustedWorkflowRerun: true });
    expect(instructions[0]).toContain("Follow the steps marked `If you chose (a):` below.");
    expect(instructions[0]).toContain("(b) wait");
    const recovery = instructions.filter((i) => i.includes("workflow rerun still fails"));
    expect(recovery).toHaveLength(1);
    expect(recovery[0]).toMatch(/^If you chose \(a\): /);
    expect(instructions.find((i) => i.includes("Rebase or otherwise update"))).toMatch(
      /^If you chose \(a\): /,
    );
    expect(instructions.at(-1)).toBe(QUEUED_CONFLICT_CONTINUATION);
  });

  it("warns a stack layer that queued layers above it may leave too", () => {
    const [step] = render({ dequeueCommand: "DEQUEUE", stackRebase: "Run `gh stack rebase`." });
    expect(step).toContain("so may any queued layers above it in this stack");
    expect(step).toContain("enqueue it and any removed layers again");
  });

  it("leaves an unqueued conflict unchanged", () => {
    const instructions = render({});
    expect(instructions.join("\n")).not.toContain("If you chose");
    expect(instructions.at(-1)).not.toBe(QUEUED_CONFLICT_CONTINUATION);
  });
});
