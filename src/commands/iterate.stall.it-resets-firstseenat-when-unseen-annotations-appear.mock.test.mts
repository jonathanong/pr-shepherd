import { describe, it, expect } from "vitest";
import {
  mockReadStallState,
  mockWriteStallState,
  STALL_TIMEOUT_S,
  makeOpts30mStall,
} from "../../test-helpers/commands/iterate-stall.test-support.mts";
import type { StallState } from "../../test-helpers/commands/iterate-stall.test-support.mts";
import {
  registerIterateHooks,
  NOW,
  makeReport,
  mockRunCheck,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";
import type { ClassifiedCheck } from "../types.mts";

registerIterateHooks();

const FAILING_CHECK: ClassifiedCheck = {
  name: "unit-tests",
  status: "COMPLETED",
  conclusion: "FAILURE",
  detailsUrl: "https://github.com/owner/repo/actions/runs/99",
  event: "pull_request",
  runId: "run-99",
  category: "failing",
};

function failingReport(annotations?: ClassifiedCheck["annotations"]) {
  return makeReport({
    status: "FAILING",
    checks: {
      passing: [],
      failing: [{ ...FAILING_CHECK, ...(annotations !== undefined && { annotations }) }],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
    },
  });
}

describe("runIterate — stall fingerprint includes unseen annotations", () => {
  it("resets firstSeenAt when unseen annotation IDs appear on an otherwise unchanged fix_code tick", async () => {
    mockRunCheck.mockResolvedValue(failingReport());
    mockReadStallState.mockResolvedValue(null);
    await runIterate(makeOpts30mStall());
    const fp1 = (mockWriteStallState.mock.calls[0]![1] as StallState).fingerprint;

    mockWriteStallState.mockClear();
    mockRunCheck.mockResolvedValue(
      failingReport([
        {
          id: "check_annotation_new",
          path: "src/a.mts",
          startLine: 1,
          endLine: 1,
          level: "WARNING",
          message: "New annotation.",
        },
      ]),
    );
    mockReadStallState.mockResolvedValue({ fingerprint: fp1, firstSeenAt: NOW - STALL_TIMEOUT_S });

    const result = await runIterate(makeOpts30mStall());

    expect(result.action).toBe("fix_code");
    const written = mockWriteStallState.mock.calls[0]![1] as StallState;
    expect(written.firstSeenAt).toBe(NOW);
    expect(written.fingerprint).not.toBe(fp1);
  });
});
