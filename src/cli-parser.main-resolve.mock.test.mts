import { describe, it, expect } from "vitest";
import {
  registerHooks,
  getStdout,
  mockRunResolveMutate,
  stderrSpy,
} from "../test-helpers/cli-parser.test-support.mts";
import { main } from "./cli-parser.mts";

registerHooks();

describe("main — resolve", () => {
  async function expectResolveError(args: string[], message: string): Promise<void> {
    await main(["node", "shepherd", "resolve", "42", ...args]);
    expect(mockRunResolveMutate).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining(message));
  }

  it.each([
    ["no action flags", [], "an action flag is required"],
    ["--fetch", ["--fetch"], "--fetch has been removed"],
    ["only --message", ["--message", "Done"], "an action flag is required"],
    ["empty action ID list", ["--resolve-thread-ids", ""], "an action flag is required"],
  ])("errors for %s", async (_label, args, message) => {
    await expectResolveError(args, message);
  });

  it("calls runResolveMutate when --resolve-thread-ids is given", async () => {
    mockRunResolveMutate.mockResolvedValue({
      repliedThreads: [],
      resolvedThreads: ["t-1"],
      minimizedComments: [],
      dismissedReviews: [],
      errors: [],
    });
    await main(["node", "shepherd", "resolve", "42", "--resolve-thread-ids", "t-1"]);
    expect(mockRunResolveMutate).toHaveBeenCalledTimes(1);
  });
  it("formatMutateResult renders rate-limit stop and pending IDs", async () => {
    mockRunResolveMutate.mockResolvedValue({
      repliedThreads: [],
      resolvedThreads: [],
      minimizedComments: ["c-1", "c-2"],
      dismissedReviews: [],
      errors: ["rate limit: API rate limit exceeded"],
      rateLimit: {
        message: "API rate limit exceeded",
        retryAfterSeconds: 60,
        remaining: 0,
        limit: 5000,
        resetAt: 1700000000,
      },
      unminimizedComments: ["c-3", "c-4"],
    });

    await main(["node", "shepherd", "resolve", "42", "--minimize-comment-ids", "c-1,c-2,c-3,c-4"]);

    const out = getStdout();
    expect(out).toContain("Minimized comments (2): c-1, c-2");
    expect(out).toContain("Stopped: GitHub rate limit hit");
    expect(out).toContain("retry after 60s");
    expect(out).toContain("reset at 2023-11-14T22:13:20.000Z");
    expect(out).toContain("Not minimized due to rate limit (2): c-3, c-4");
    expect(out).not.toContain("Errors:");
  });
  it("formatMutateResult renders rate-limit stop without optional limit details", async () => {
    mockRunResolveMutate.mockResolvedValue({
      repliedThreads: [],
      resolvedThreads: [],
      minimizedComments: [],
      dismissedReviews: [],
      errors: ["rate limit: secondary limit"],
      rateLimit: { message: "secondary limit" },
    });

    await main(["node", "shepherd", "resolve", "42", "--resolve-thread-ids", "t-1"]);

    const out = getStdout();
    expect(out).toContain("Stopped: GitHub rate limit hit — secondary limit");
    expect(out).not.toContain("retry after");
    expect(out).not.toContain("remaining");
    expect(out).not.toContain("reset at");
  });
});
