import { describe, it, expect } from "vitest";
import { formatMergeRequirementLines, projectMergeRequirements } from "./requirements-format.mts";

describe("projectMergeRequirements", () => {
  it("projects non-trivial approvals and unknown conversation policy", () => {
    const req = {
      approvals: { current: 1, requiredCount: 0 },
      conversationsResolved: { resolved: true, unresolvedCount: 0 },
    };
    expect(projectMergeRequirements(req)).toEqual(req);
    expect(formatMergeRequirementLines(req)[1]).toBe(
      "Conversations Resolved: Yes [Requirement Unknown]",
    );
  });
});
