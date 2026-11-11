import { describe, it, expect } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("runIterate — eventTargetSink", () => {
  it("reports the head SHA and ref from the tick's batch data without changing the result", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ headSha: "abc123", headRefName: "feature/x" }));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: false,
      remainingSeconds: 300,
    });
    const sink: { headSha?: string; headRef?: string } = {};
    const withSink = await runIterate(makeOpts({ noAutoMarkReady: true, eventTargetSink: sink }));
    expect(sink).toEqual({ headSha: "abc123", headRef: "feature/x" });
    const without = await runIterate(makeOpts({ noAutoMarkReady: true }));
    expect(withSink).toEqual(without);
  });
});
