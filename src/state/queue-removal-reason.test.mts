import { describe, expect, it } from "vitest";
import { isCiQueueRemovalReason } from "./queue-removal-ack.mts";

describe("isCiQueueRemovalReason", () => {
  it("accepts GitHub's CI-driven removal reason", () => {
    expect(isCiQueueRemovalReason("failed_checks")).toBe(true);
  });

  it.each([
    "merged",
    "merge_conflict",
    "invalid_merge_commit",
    "stack_invalidated",
    "CI_FAILURE",
    "MERGE_QUEUE_POLICY_CHECK_FAILURE",
    "FAILED_CHECKS",
    "",
    null,
    undefined,
  ])("rejects %s", (reason) => {
    expect(isCiQueueRemovalReason(reason)).toBe(false);
  });
});
