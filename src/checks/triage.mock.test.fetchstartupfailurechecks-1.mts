// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerHooks,
  REPO,
  fetchStartupFailureChecks,
  makeWorkflowRunsResponse,
  mockFetch,
} from "./triage.test-support.mts";

registerHooks();

describe("fetchStartupFailureChecks", () => {
  it("maps startup_failure workflow runs to CheckRun fields", async () => {
    mockFetch.mockResolvedValueOnce(
      makeWorkflowRunsResponse([
        {
          id: 25406234225,
          name: "CI",
          event: "pull_request",
          status: "completed",
          conclusion: "startup_failure",
          html_url: "https://github.com/owner/repo/actions/runs/25406234225",
          display_title: "ci: skip secret-backed jobs for dependency bots",
          pull_requests: [{ number: 42, head: { sha: "abc123" } }],
        },
      ]),
    );

    const checks = await fetchStartupFailureChecks(REPO, "abc123", 42);

    expect(checks).toEqual([
      {
        name: "CI",
        status: "COMPLETED",
        conclusion: "STARTUP_FAILURE",
        detailsUrl: "https://github.com/owner/repo/actions/runs/25406234225",
        event: "pull_request",
        runId: "25406234225",
        summary: "ci: skip secret-backed jobs for dependency bots",
      },
    ]);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("/actions/runs");
    expect(url).toContain("head_sha=abc123");
    expect(url).toContain("status=startup_failure");
  });
  it("falls back to workflow run id when the run name is blank", async () => {
    mockFetch.mockResolvedValueOnce(
      makeWorkflowRunsResponse([
        {
          id: 123,
          name: " ",
          event: "pull_request",
          status: "completed",
          conclusion: "startup_failure",
          html_url: "https://github.com/owner/repo/actions/runs/123",
          display_title: "",
          pull_requests: [{ number: 42, head: { sha: "abc123" } }],
        },
      ]),
    );

    const [check] = await fetchStartupFailureChecks(REPO, "abc123", 42);

    expect(check!.name).toBe("workflow run 123");
    expect(check).not.toHaveProperty("summary");
  });
  it("omits summary when GitHub omits display_title", async () => {
    mockFetch.mockResolvedValueOnce(
      makeWorkflowRunsResponse([
        {
          id: 124,
          name: "CI",
          event: "pull_request",
          status: "completed",
          conclusion: "startup_failure",
          html_url: "https://github.com/owner/repo/actions/runs/124",
          pull_requests: [{ number: 42, head: { sha: "abc123" } }],
        },
      ]),
    );

    const [check] = await fetchStartupFailureChecks(REPO, "abc123", 42);

    expect(check!.name).toBe("CI");
    expect(check).not.toHaveProperty("summary");
  });
  it("filters out runs when GitHub omits pull_requests", async () => {
    mockFetch.mockResolvedValueOnce(
      makeWorkflowRunsResponse([
        {
          id: 125,
          name: "CI",
          event: "pull_request",
          status: "completed",
          conclusion: "startup_failure",
          html_url: "https://github.com/owner/repo/actions/runs/125",
        },
      ]),
    );

    await expect(fetchStartupFailureChecks(REPO, "abc123", 42)).resolves.toEqual([]);
  });
  it("filters out startup-failure runs from other PRs sharing the same head SHA", async () => {
    mockFetch.mockResolvedValueOnce(
      makeWorkflowRunsResponse([
        {
          id: 123,
          name: "CI",
          event: "pull_request",
          status: "completed",
          conclusion: "startup_failure",
          html_url: "https://github.com/owner/repo/actions/runs/123",
          pull_requests: [{ number: 41, head: { sha: "abc123" } }],
        },
        {
          id: 456,
          name: "CI",
          event: "pull_request",
          status: "completed",
          conclusion: "startup_failure",
          html_url: "https://github.com/owner/repo/actions/runs/456",
          pull_requests: [{ number: 42, head: { sha: "abc123" } }],
        },
      ]),
    );

    const checks = await fetchStartupFailureChecks(REPO, "abc123", 42);

    expect(checks.map((c) => c.runId)).toEqual(["456"]);
  });
  it("matches startup-failure runs when GitHub omits the PR head SHA", async () => {
    mockFetch.mockResolvedValueOnce(
      makeWorkflowRunsResponse([
        {
          id: 789,
          name: "CI",
          event: "pull_request",
          status: "completed",
          conclusion: "startup_failure",
          html_url: "https://github.com/owner/repo/actions/runs/789",
          pull_requests: [{ number: 42, head: null }],
        },
      ]),
    );

    const checks = await fetchStartupFailureChecks(REPO, "abc123", 42);

    expect(checks.map((c) => c.runId)).toEqual(["789"]);
  });
});
