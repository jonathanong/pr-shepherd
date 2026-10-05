import { describe, expect, it } from "vitest";
import type { AgentCheck, ShepherdReport } from "../../types.mts";
import {
  buildQueueEjectionInstruction,
  currentEjectionCommit,
} from "./queue-recovery-instructions.mts";

const base = { baseBranch: "main", queueCommitOid: "queue-commit-1" };

describe("buildQueueEjectionInstruction", () => {
  it("orders rebase, fix, and requeue for a transient failure", () => {
    const text = buildQueueEjectionInstruction({ ...base, recovery: "requeue" });
    const rebase = text.indexOf("Rebase the PR head onto the latest `main`");
    const fix = text.indexOf("If the failure belongs to this PR, fix it");
    const requeue = text.indexOf("run the `requeue:` command exactly as printed");
    expect(rebase).toBeGreaterThan(-1);
    expect(fix).toBeGreaterThan(rebase);
    expect(requeue).toBeGreaterThan(fix);
    expect(text).toContain("its queue commit `queue-commit-1`");
    expect(text).toContain("any entries queued ahead of it");
    expect(text).toContain("push the rebased head and iterate");
    expect(text).toContain("do not run `requeue:` after any push");
    expect(text).toContain("caused by another entry in the same queue group");
  });

  it("routes a native stack through the printed stack rebase and acknowledgment", () => {
    const text = buildQueueEjectionInstruction({
      ...base,
      stackRebase: "run `gh stack rebase`.",
      recovery: "acknowledge",
    });
    expect(text).toContain("Update the stack onto the latest `main`");
    expect(text).toContain("run `gh stack rebase`.");
    expect(text).toContain("push the rewritten stack with `gh stack push`");
    expect(text).toContain("do not acknowledge it; report it");
    expect(text).toContain("run `acknowledge queue removal:` exactly as printed");
    expect(text).not.toContain("requeue:");
  });

  it("forbids enqueueing when no recovery command was printed", () => {
    const text = buildQueueEjectionInstruction({ ...base, recovery: "none" });
    expect(text).toContain("Rebase the PR head onto the latest `main`");
    expect(text).toContain("do not requeue it; report it");
    expect(text).toContain("so do not enqueue the PR");
    expect(text).not.toContain("requeue:");
  });
});

describe("currentEjectionCommit", () => {
  const failing = [{ scope: "merge_group", commitOid: "q1" }] as AgentCheck[];
  const report = (mergeQueue: object | undefined) => ({ mergeQueue }) as unknown as ShepherdReport;
  const removal = { latestRemoval: { beforeCommitOid: "q1", createdAtUnix: 1 } };

  it("returns the removed queue commit when its checks fail", () => {
    expect(currentEjectionCommit(report({ ...removal, inQueue: false }), failing)).toBe("q1");
  });

  it("ignores missing, re-queued, stale, or unmatched removals", () => {
    expect(currentEjectionCommit(report(undefined), failing)).toBeUndefined();
    expect(currentEjectionCommit(report({ ...removal, inQueue: true }), failing)).toBeUndefined();
    expect(
      currentEjectionCommit(report({ ...removal, headUpdatedAfterRemoval: true }), failing),
    ).toBeUndefined();
    expect(currentEjectionCommit(report(removal), [{ commitOid: "q1" }] as AgentCheck[])).toBe(
      undefined,
    );
  });
});
