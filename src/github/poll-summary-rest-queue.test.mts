import { describe, expect, it } from "vitest";
import { restQueueRequirement } from "./poll-summary-rest-queue.mts";

describe("REST queue requirement completeness", () => {
  it.each([null, { nodes: [], pageInfo: { hasNextPage: true } }, { nodes: [] }])(
    "preserves unknown policy for missing or incomplete rules: %j",
    (rules) => {
      expect(
        restQueueRequirement({ baseRef: { branchProtectionRule: null, rules } }),
      ).toBeUndefined();
    },
  );

  it("keeps a positive queue rule even when classic protection is unavailable", () => {
    expect(
      restQueueRequirement({
        baseRef: {
          branchProtectionRule: null,
          rules: {
            nodes: [{ type: "MERGE_QUEUE", parameters: null }],
            pageInfo: { hasNextPage: false },
          },
        },
        transportUnavailable: [
          { field: "branchProtection", reason: "Classic branch protection unavailable (HTTP 403)" },
        ],
      }),
    ).toBe(true);
  });
});
