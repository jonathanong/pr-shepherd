import { describe, expect, it } from "vitest";
import type { ResolveCommand } from "../../types.mts";
import { buildFixInstructions } from "./render.mts";
import { QUEUED_CONFLICT_CONTINUATION, isTriageContinuation } from "./check-instructions.mts";

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
  behindBaseHint?: string;
  resolve?: ResolveCommand;
}): string[] {
  return buildFixInstructions(
    [],
    [],
    [],
    [],
    "main",
    opts.resolve ?? RESOLVE,
    true,
    42,
    [],
    [],
    [],
    [],
    [],
    undefined,
    opts.behindBaseHint ?? "",
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

  it("marks the configured branch-update hint as path (a) on both conflict routes", () => {
    for (const hasExhaustedWorkflowRerun of [false, true]) {
      const instructions = render({
        dequeueCommand: "DEQUEUE",
        hasExhaustedWorkflowRerun,
        behindBaseHint: "rebase --force-with-lease",
      });
      const hint = instructions.filter((i) => i.includes("rebase --force-with-lease"));
      expect(hint).toHaveLength(1);
      expect(hint[0]).toMatch(/^If you chose \(a\): /);
    }
  });

  it("warns a stack layer that queued layers above it may leave too", () => {
    const [step] = render({ dequeueCommand: "DEQUEUE", stackRebase: "Run `gh stack rebase`." });
    expect(step).toContain("so may any queued layers above it in this stack");
    expect(step).toContain("enqueue it and any removed layers again");
  });

  it("defers review mutations to path (a) so the wait path never resolves an unpushed fix", () => {
    const instructions = render({
      dequeueCommand: "DEQUEUE",
      resolve: { ...RESOLVE, hasMutations: true, requiresHeadSha: true },
    });
    const mutation = instructions.filter((i) => i.includes("pr-shepherd apply review 42"));
    expect(mutation.length).toBeGreaterThan(0);
    for (const step of mutation) expect(step).toMatch(/^If you chose \(a\): /);
    expect(instructions[0]).toContain("leaves review fixes and mutations for a later tick");
  });

  it("lets the quota warning rewrite the queued continuation", () => {
    expect(isTriageContinuation(QUEUED_CONFLICT_CONTINUATION)).toBe(true);
  });

  it("leaves an unqueued conflict unchanged", () => {
    const instructions = render({});
    expect(instructions.join("\n")).not.toContain("If you chose");
    expect(instructions.at(-1)).not.toBe(QUEUED_CONFLICT_CONTINUATION);
  });
});
