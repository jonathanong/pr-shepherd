import { describe, expect, it } from "vitest";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import { trunkRequiredContexts } from "./poll-summary-unreported.mts";

function layer(overrides: Partial<RawSummaryPr>): RawSummaryPr {
  return {
    number: 1,
    state: "OPEN",
    baseRefName: "main",
    stack: { number: 623, size: 2, baseRefName: "main" },
    ...overrides,
  } as RawSummaryPr;
}

describe("trunkRequiredContexts", () => {
  it("reads required contexts from the trunk layer when the parent branch has no rules", () => {
    const contexts = trunkRequiredContexts([
      layer({
        number: 613,
        baseRefName: "main",
        baseRef: {
          branchProtectionRule: null,
          rules: {
            nodes: [
              {
                type: "REQUIRED_STATUS_CHECKS",
                parameters: {
                  strictRequiredStatusChecksPolicy: false,
                  requiredStatusChecks: [
                    { context: "tests" },
                    { context: "build" },
                    { context: "gitleaks" },
                  ],
                },
              },
            ],
          },
        },
      }),
      layer({ number: 622, baseRefName: "feature-parent", baseRef: null }),
    ]);
    expect(contexts).toEqual(["tests", "build", "gitleaks"]);
  });
});
