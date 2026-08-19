import { describe, it, expect, vi } from "vitest";
import {
  registerHooks,
  REPO,
  fetchStartupFailureChecks,
  makeJobsResponse,
  makeWorkflowRunsResponse,
  mockFetch,
  triageFailingChecks,
  makeCheck,
} from "../../test-helpers/checks/triage.test-support.mts";

registerHooks();

function withRemaining(res: Response, remaining: number): Response {
  const headers = new Headers(res.headers);
  headers.set("x-ratelimit-remaining", String(remaining));
  headers.set("x-ratelimit-limit", "5000");
  headers.set("x-ratelimit-reset", "1");
  return { ...res, headers } as Response;
}

describe("REST pagination stops when remaining is 0", () => {
  it("stops extra startup-failure pages", async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      name: "CI",
      event: "pull_request",
      status: "completed",
      conclusion: "startup_failure",
      html_url: `https://github.com/owner/repo/actions/runs/${i + 1}`,
      pull_requests: [{ number: 42, head: { sha: "abc123" } }],
    }));
    mockFetch.mockResolvedValueOnce(
      withRemaining(makeWorkflowRunsResponse(fullPage), 0) as unknown as Response,
    );

    const checks = await fetchStartupFailureChecks(REPO, "abc123", 42);
    expect(checks).toHaveLength(100);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("stops extra job pages", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockFetch.mockResolvedValueOnce(
      withRemaining(
        makeJobsResponse(
          Array.from({ length: 100 }, (_, i) => ({
            name: `job-${i}`,
            conclusion: "success",
          })),
        ),
        0,
      ) as unknown as Response,
    );

    await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("rate limit remaining is 0"));
    stderr.mockRestore();
  });
});
