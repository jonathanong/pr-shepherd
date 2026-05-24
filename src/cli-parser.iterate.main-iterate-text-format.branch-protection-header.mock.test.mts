import { describe, it, expect } from "vitest";
import { registerHooks, getStdout, mockRunIterate } from "./cli-parser.iterate.test-support.mts";
import { makeIterateResult } from "./cli-parser.iterate-fixtures.test-support.mts";
import { main } from "./cli-parser.mts";

registerHooks();

describe("main — iterate text format — **required** header line", () => {
  it("shows all fields when branchProtection has approvals, conversation-resolution, and contexts", async () => {
    const result = {
      ...makeIterateResult("wait"),
      branchProtection: {
        requiresApprovingReviews: true,
        requiredApprovingReviewCount: 1,
        requiresConversationResolution: true,
        requiresStatusChecks: true,
        requiredStatusCheckContexts: ["ci/build"],
      },
    };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42"]);
    const text = getStdout();
    expect(text).toContain("**required**");
    expect(text).toContain("approvals `1`");
    expect(text).toContain("conversation-resolution required");
    expect(text).toContain("checks: `ci/build`");
  });
  it("shows 'status checks required' when requiresStatusChecks true but no contexts", async () => {
    const result = {
      ...makeIterateResult("wait"),
      branchProtection: {
        requiresApprovingReviews: false,
        requiredApprovingReviewCount: 0,
        requiresConversationResolution: false,
        requiresStatusChecks: true,
        requiredStatusCheckContexts: [],
      },
    };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).toContain("status checks required");
  });
  it("shows only approvals when requiresStatusChecks is false", async () => {
    const result = {
      ...makeIterateResult("wait"),
      branchProtection: {
        requiresApprovingReviews: true,
        requiredApprovingReviewCount: 2,
        requiresConversationResolution: false,
        requiresStatusChecks: false,
        requiredStatusCheckContexts: [],
      },
    };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42"]);
    const text = getStdout();
    expect(text).toContain("approvals `2`");
    expect(text).not.toContain("status checks");
  });
  it("cancel action includes requiredLine when branchProtection is present", async () => {
    const result = {
      ...makeIterateResult("cancel"),
      branchProtection: {
        requiresApprovingReviews: true,
        requiredApprovingReviewCount: 1,
        requiresConversationResolution: false,
        requiresStatusChecks: false,
        requiredStatusCheckContexts: [],
      },
    };
    mockRunIterate.mockResolvedValue(result);
    await main(["node", "shepherd", "iterate", "42"]);
    expect(getStdout()).toContain("**required**");
  });
});
