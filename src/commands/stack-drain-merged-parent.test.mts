import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import { withPollSummaryInstructions } from "./poll-summary-instructions.mts";

const ready = { readyReceipt: true } as const;

function text(result: { instructions?: string[] }): string {
  return result.instructions?.join("\n") ?? "";
}

describe("native stack with merged lower layers", () => {
  it.each([false, true])(
    "keeps a two-merged/four-open stack reviewable without merging its retained-base bottom (work: %s)",
    (hasWork) => {
      const numbers = [2509, 2534, 2547, 2569, 2627, 2629];
      const layers = numbers.map((pr, index) =>
        row(pr, index + 1, {
          stack: { number: 2535, size: 6, position: index + 1, baseRefName: "main" },
          baseRefName: index < 2 ? "main" : `layer-${numbers[index - 1]}`,
          ...(index < 2
            ? { state: "MERGED", reasons: ["merged"] }
            : hasWork
              ? { action: "fix_code", reasons: ["actionable-reviews"] }
              : ready),
        }),
      );
      const result = withPollSummaryInstructions(stack(layers), true);

      expect(result.nextAction).toBe(hasWork ? "shepherd" : "wait");
      expect(text(result)).not.toContain("gh stack merge");
      if (hasWork) {
        for (const pr of numbers.slice(2)) {
          expect(text(result)).toContain(`pull/${pr} --until-terminal`);
        }
      } else {
        expect(text(result)).toContain("PR #2547 still targets `layer-2534` rather than `main`");
      }
    },
  );
});
