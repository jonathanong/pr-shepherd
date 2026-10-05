import { describe, expect, it } from "vitest";
import type { AgentCheck, ShepherdReport } from "../../types.mts";
import { currentEjectionCommit, queueEjectionSteps } from "./queue-recovery-instructions.mts";

const step = (recovery: "requeue" | "acknowledge" | "none", route?: string) =>
  queueEjectionSteps(recovery, route, false)[0]!;

describe("ejection step text", () => {
  it("updates first, guards the printed requeue, and names the API fallback", () => {
    expect(step("requeue")).toBe(
      'Triage the merge-queue ejection before any requeue. Update the PR head from the latest base first. Run `requeue:` only if the failure does not reproduce on the updated head, neither the update nor a code change altered the head, and no other blocker remains. If gh reports auto-merge is disabled, run `requeue API fallback:` instead. Playbook: "Merge queue ejection".',
    );
  });

  it("prints the native-stack update route and guards the acknowledgment", () => {
    const text = step("acknowledge", "run `gh stack rebase`.");
    expect(text).toContain("Update the stack from the latest base first: run `gh stack rebase`.");
    expect(text).toContain(
      "Run `acknowledge queue removal:` only if the failure does not reproduce",
    );
  });

  it("forbids enqueueing when no recovery command was printed", () => {
    const text = step("none");
    expect(text).toContain("so do not enqueue the PR.");
    expect(text).not.toContain("requeue:");
  });
});

describe("queueEjectionSteps", () => {
  it("emits nothing without a current ejection", () => {
    expect(queueEjectionSteps(undefined, "route", false)).toEqual([]);
  });

  it("points at a stack route already printed for a conflict", () => {
    const [step] = queueEjectionSteps("acknowledge", "run `gh stack rebase`.", true);
    expect(step).toContain(
      "Update the stack from the latest base first: use the stack route printed above.",
    );
    expect(step).not.toContain("gh stack rebase");
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
