import { describe, it, expect } from "vitest";
import {
  registerHooks,
  getStdout,
  mockRunResolveMutate,
} from "../test-helpers/cli-parser.test-support.mts";
import { main } from "./cli-parser.mts";

registerHooks();

describe("main — resolve", () => {
  it("formatMutateResult renders dismissed reviews, unresolved, unminimized, and undismissed IDs", async () => {
    mockRunResolveMutate.mockResolvedValue({
      resolvedThreads: [],
      repliedThreads: [],
      minimizedComments: [],
      dismissedReviews: ["r-1"],
      errors: [],
      unresolvedThreads: ["t-1"],
      unminimizedComments: ["c-1"],
      undismissedReviews: ["r-2"],
    });

    await main([
      "node",
      "shepherd",
      "resolve",
      "42",
      "--dismiss-review-ids",
      "r-1,r-2",
      "--message",
      "done",
    ]);

    const out = getStdout();
    expect(out).toContain("Dismissed reviews (1): r-1");
    expect(out).toContain("Not resolved due to rate limit (1): t-1");
    expect(out).toContain("Not minimized due to rate limit (1): c-1");
    expect(out).toContain("Not dismissed due to rate limit (1): r-2");
  });
  it("formatMutateResult renders skipped dismissals", async () => {
    mockRunResolveMutate.mockResolvedValue({
      resolvedThreads: [],
      repliedThreads: [],
      minimizedComments: [],
      dismissedReviews: ["r-1"],
      errors: [],
      skippedDismissals: ["r-2", "r-3"],
    });

    await main([
      "node",
      "shepherd",
      "resolve",
      "42",
      "--dismiss-review-ids",
      "r-1,r-2,r-3",
      "--message",
      "done",
    ]);

    const out = getStdout();
    expect(out).toContain("Dismissed reviews (1): r-1");
    expect(out).toContain("Skipped dismissals (2): r-2, r-3");
  });
  it("formatMutateResult renders non-rate-limit errors", async () => {
    mockRunResolveMutate.mockResolvedValue({
      resolvedThreads: [],
      repliedThreads: [],
      minimizedComments: [],
      dismissedReviews: [],
      errors: ["t-1: nope"],
    });

    await main(["node", "shepherd", "resolve", "42", "--resolve-thread-ids", "t-1"]);

    expect(getStdout()).toContain("Errors:\n  t-1: nope");
  });
  it("resolve mutate --format=json includes rate-limit stop and pending IDs", async () => {
    mockRunResolveMutate.mockResolvedValue({
      resolvedThreads: ["t-1"],
      repliedThreads: [],
      minimizedComments: [],
      dismissedReviews: [],
      errors: ["rate limit: secondary rate limit"],
      rateLimit: { message: "secondary rate limit" },
      unresolvedThreads: ["t-2"],
    });

    await main([
      "node",
      "shepherd",
      "resolve",
      "42",
      "--resolve-thread-ids",
      "t-1,t-2",
      "--format=json",
    ]);

    const parsed = JSON.parse(getStdout()) as {
      rateLimit: { message: string };
      unresolvedThreads: string[];
    };
    expect(parsed.rateLimit.message).toBe("secondary rate limit");
    expect(parsed.unresolvedThreads).toEqual(["t-2"]);
  });
});
