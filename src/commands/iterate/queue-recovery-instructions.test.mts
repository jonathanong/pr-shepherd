import { describe, expect, it } from "vitest";
import type { AgentCheck, ShepherdReport } from "../../types.mts";
import {
  buildQueueEjectionInstruction,
  currentEjectionCommit,
} from "./queue-recovery-instructions.mts";

describe("buildQueueEjectionInstruction", () => {
  it("guards the printed requeue and points at the playbook", () => {
    expect(buildQueueEjectionInstruction({ recovery: "requeue" })).toBe(
      'Triage the merge-queue ejection before any requeue. Run `requeue:` only if the failure does not reproduce and the head did not change. Playbook: "Merge queue ejection".',
    );
  });

  it("prints the native-stack update route and guards the acknowledgment", () => {
    const text = buildQueueEjectionInstruction({
      stackRebase: "run `gh stack rebase`.",
      recovery: "acknowledge",
    });
    expect(text).toContain("Stack update route: run `gh stack rebase`.");
    expect(text).toContain(
      "Run `acknowledge queue removal:` only if the failure does not reproduce",
    );
  });

  it("forbids enqueueing when no recovery command was printed", () => {
    const text = buildQueueEjectionInstruction({ recovery: "none" });
    expect(text).toContain("so do not enqueue the PR.");
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
