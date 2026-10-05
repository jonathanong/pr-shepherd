import { describe, it, expect } from "vitest";
import {
  mockReadStallState,
  mockWriteStallState,
  makeOpts30mStall,
} from "../../test-helpers/commands/iterate-stall.test-support.mts";
import type { StallState } from "../../test-helpers/commands/iterate-stall.test-support.mts";
import {
  registerIterateHooks,
  makeReport,
  mockRunCheck,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

const inProgressCheck: import("../types.mts").ClassifiedCheck = {
  name: "ci-slow",
  status: "IN_PROGRESS",
  conclusion: null,
  detailsUrl: "https://github.com/owner/repo/actions/runs/1",
  event: "pull_request",
  runId: "run-1",
  category: "in_progress",
};

async function fingerprintFor(queueCommit: string): Promise<string> {
  mockWriteStallState.mockClear();
  mockReadStallState.mockResolvedValue({ ok: true, state: null });
  mockRunCheck.mockResolvedValue({
    ...makeReport({
      checks: {
        passing: [],
        failing: [],
        inProgress: [inProgressCheck],
        skipped: [],
        filtered: [],
        filteredNames: [],
        blockedByFilteredCheck: false,
      },
    }),
    mergeQueue: {
      enabled: true,
      inQueue: false,
      latestRemoval: { reason: "failed_checks", createdAtUnix: 1, beforeCommitOid: queueCommit },
    },
  });
  await runIterate(makeOpts30mStall());
  return (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;
}

describe("runIterate — stall-timeout guard", () => {
  it("keys the fingerprint on the removed queue commit", async () => {
    const first = await fingerprintFor("queue-commit-1");
    expect(first).toContain("queue-commit-1");
    expect(await fingerprintFor("queue-commit-2")).not.toBe(first);
  });
});
