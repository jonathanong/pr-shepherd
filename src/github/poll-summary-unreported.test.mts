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
  it("reads required contexts from the trunk layer when the parent branch has no rules", async () => {
    const contexts = await trunkRequiredContexts(
      [
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
      ],
      { owner: "acme", name: "widgets" },
    );
    expect(contexts).toEqual(["tests", "build", "gitleaks"]);
  });

  it("retains current trunk rules after its trunk-based layers have merged", async () => {
    const contexts = await trunkRequiredContexts(
      [
        layer({ number: 2509, state: "MERGED", baseRefName: "main", baseRef: null }),
        layer({
          number: 2534,
          state: "MERGED",
          baseRefName: "main",
          baseRef: {
            branchProtectionRule: null,
            rules: {
              nodes: [
                {
                  type: "REQUIRED_STATUS_CHECKS",
                  parameters: {
                    requiredStatusChecks: [{ context: "tests" }, { context: "build" }],
                  },
                },
              ],
            },
          },
        }),
        layer({ number: 2547, baseRefName: "feature-2534", baseRef: null }),
        layer({ number: 2569, baseRefName: "feature-2547", baseRef: null }),
        layer({ number: 2627, baseRefName: "feature-2569", baseRef: null }),
        layer({ number: 2629, baseRefName: "feature-2627", baseRef: null }),
      ],
      { owner: "acme", name: "widgets" },
    );
    expect(contexts).toEqual(["tests", "build"]);
  });
});
