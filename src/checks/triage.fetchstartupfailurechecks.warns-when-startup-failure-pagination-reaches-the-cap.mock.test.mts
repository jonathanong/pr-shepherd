// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  REPO,
  fetchStartupFailureChecks,
  makeErrorResponse,
  makeWorkflowRunsResponse,
  mockFetch,
} from "./triage.test-support.mts";

registerHooks();

describe("fetchStartupFailureChecks", () => {
  it("warns when startup-failure pagination reaches the cap", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      for (let page = 0; page < 10; page++) {
        mockFetch.mockResolvedValueOnce(
          makeWorkflowRunsResponse(
            Array.from({ length: 100 }, (_, i) => ({
              id: page * 100 + i,
              name: "CI",
              event: "pull_request",
              status: "completed",
              conclusion: "startup_failure",
              html_url: `https://github.com/owner/repo/actions/runs/${page * 100 + i}`,
              pull_requests: [{ number: 42, head: { sha: "abc123" } }],
            })),
          ),
        );
      }

      const checks = await fetchStartupFailureChecks(REPO, "abc123", 42);

      expect(checks).toHaveLength(1000);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("startup-failure run pagination cap"),
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });
  it("returns an empty supplement when the Actions runs fetch fails", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(403));
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      const checks = await fetchStartupFailureChecks(REPO, "abc123", 42);

      expect(checks).toEqual([]);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining("startup-failure run fetch failed for PR #42 at abc123 (ignored)"),
      );
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
