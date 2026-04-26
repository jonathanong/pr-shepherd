import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { triageFailingChecks } from "./triage.mts";
import type { ClassifiedCheck } from "../types.mts";

const REPO = { owner: "owner", name: "repo" };

function makeCheck(overrides: Partial<ClassifiedCheck> = {}): ClassifiedCheck {
  return {
    name: "tests",
    status: "COMPLETED",
    conclusion: "FAILURE",
    detailsUrl: "https://github.com/owner/repo/actions/runs/99/jobs/1",
    event: "pull_request",
    runId: "run-99",
    category: "failing",
    ...overrides,
  };
}

function makeJobsResponse(
  jobs: Array<{
    id: number;
    name: string;
    conclusion: string;
    steps?: Array<{ name: string; number: number; conclusion: string | null }>;
  }>,
): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve({ jobs }),
    text: () => Promise.resolve(JSON.stringify({ jobs })),
  } as unknown as Response;
}

function makeLogsRedirectResponse(logUrl: string): Response {
  return {
    ok: false,
    status: 302,
    headers: new Headers({ location: logUrl }),
  } as unknown as Response;
}

function makeLogTextResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  process.env["GH_TOKEN"] = "test-token";
});

describe("triageFailingChecks — step log extraction", () => {
  it("extracts only lines within the matching ##[group] section", async () => {
    const log = [
      "2024-01-01T00:00:00Z ##[group]Set up job",
      "2024-01-01T00:00:01Z setup line 1",
      "2024-01-01T00:00:02Z ##[endgroup]",
      "2024-01-01T00:00:03Z ##[group]Run tests",
      "2024-01-01T00:00:04Z test failure output",
      "2024-01-01T00:00:05Z ##[endgroup]",
    ].join("\n");
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 1,
            name: "tests",
            conclusion: "failure",
            steps: [{ name: "Run tests", number: 1, conclusion: "failure" }],
          },
        ]),
      )
      .mockResolvedValueOnce(makeLogsRedirectResponse("https://s3.example.com/logs"))
      .mockResolvedValueOnce(makeLogTextResponse(log));
    const [result] = await triageFailingChecks([makeCheck()], REPO, 10);
    expect(result!.logTail).toContain("test failure output");
    expect(result!.logTail).not.toContain("setup line 1");
  });

  it("falls back to full log when no group matches the failed step", async () => {
    const log = ["line 1", "line 2", "line 3"].join("\n");
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 1,
            name: "tests",
            conclusion: "failure",
            steps: [{ name: "Run tests", number: 1, conclusion: "failure" }],
          },
        ]),
      )
      .mockResolvedValueOnce(makeLogsRedirectResponse("https://s3.example.com/logs"))
      .mockResolvedValueOnce(makeLogTextResponse(log));
    const [result] = await triageFailingChecks([makeCheck()], REPO, 10);
    expect(result!.logTail).toBe("line 1\nline 2\nline 3");
  });

  it("applies logTailChars character limit after line limit", async () => {
    const log = "line-00\nline-01\nline-02\nline-03\nline-04";
    mockFetch
      .mockResolvedValueOnce(makeJobsResponse([{ id: 1, name: "tests", conclusion: "failure" }]))
      .mockResolvedValueOnce(makeLogsRedirectResponse("https://s3.example.com/logs"))
      .mockResolvedValueOnce(makeLogTextResponse(log));
    const [result] = await triageFailingChecks([makeCheck()], REPO, 10, 10);
    expect(result!.logTail!.length).toBeLessThanOrEqual(10);
  });
});
