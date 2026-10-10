import { describe, expect, it } from "vitest";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";

describe("REST queued stack merge methods", () => {
  it.each([
    { configured: "squash", allowed: ["merge"] as const },
    { configured: undefined, allowed: [] as const },
  ])(
    "emits a guarded queue request despite unavailable local direct methods: %j",
    async ({ configured, allowed }) => {
      if (configured) writeRc(`merge:\n  method: ${configured}\n`);
      await freshLoadConfig();
      const { withPollSummaryInstructions } = await import("./poll-summary-instructions.mts");
      const result = withPollSummaryInstructions(
        {
          ...stack([
            row(1, 1, { readyReceipt: true, transport: "rest", requiresMergeQueue: true }),
          ]),
          allowedMergeMethods: [...allowed],
        },
        true,
      );
      expect(result.nextAction).toBe("merge");
      expect(result.instructions?.[0]).toContain("--merge-action merge_queue");
      expect(result.instructions?.[0]).toContain("--require-sha");
      expect(result.instructions?.[0]).not.toContain("--method");
      expect(result.instructions?.[0]).not.toContain("gh stack merge");
    },
  );
});
