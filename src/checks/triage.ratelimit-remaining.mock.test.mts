import { describe, it, expect, vi } from "vitest";
import {
  registerHooks,
  REPO,
  fetchStartupFailureChecks,
  makeJobsResponse,
  makeErrorResponse,
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
  it("does not claim omitted enrichment after a complete final jobs page", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockFetch.mockResolvedValueOnce(withRemaining(makeJobsResponse([]), 0));

    await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining("enrichment is incomplete"));
    stderr.mockRestore();
  });

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
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("REST core quota is exhausted"));
    stderr.mockRestore();
  });

  it("omits queued enrichment after an in-flight worker exhausts REST core", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockFetch
      .mockResolvedValueOnce(withRemaining(makeJobsResponse([]), 0))
      .mockResolvedValue(makeJobsResponse([]));
    const checks = Array.from({ length: 5 }, (_, index) =>
      makeCheck({ runId: `run-${index}`, name: `check-${index}` }),
    );

    expect(await triageFailingChecks(checks, REPO)).toHaveLength(5);
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("enrichment is incomplete"));
    stderr.mockRestore();
  });

  it("retains earlier startup and job pages when a later page hits the primary limit", async () => {
    const runs = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: "CI",
      event: "pull_request",
      status: "completed",
      conclusion: "startup_failure",
      html_url: `https://github.com/owner/repo/actions/runs/${index + 1}`,
      pull_requests: [{ number: 42, head: { sha: "abc123" } }],
    }));
    mockFetch
      .mockResolvedValueOnce(makeWorkflowRunsResponse(runs))
      .mockResolvedValueOnce(withRemaining(makeErrorResponse(403), 0));
    expect(await fetchStartupFailureChecks(REPO, "abc123", 42)).toHaveLength(100);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    mockFetch.mockReset();
    const jobs = Array.from({ length: 100 }, (_, index) => ({
      name: index === 0 ? "tests" : `job-${index}`,
      conclusion: index === 0 ? "failure" : "success",
      run_attempt: 2,
    }));
    mockFetch
      .mockResolvedValueOnce(makeJobsResponse(jobs))
      .mockResolvedValueOnce(withRemaining(makeErrorResponse(403), 0));
    const [check] = await triageFailingChecks([makeCheck()], REPO);
    expect(check?.runAttempt).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("propagates secondary throttles before later GitHub reads", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: new Headers({
        "x-ratelimit-resource": "core",
        "x-ratelimit-remaining": "4900",
        "x-ratelimit-limit": "5000",
        "x-ratelimit-reset": "1700000180",
      }),
      text: () => Promise.resolve("You have exceeded a secondary rate limit"),
    } as unknown as Response);
    await expect(triageFailingChecks([makeCheck()], REPO)).rejects.toMatchObject({ exitCode: 75 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
