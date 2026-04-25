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

type JobStub = {
  id: number;
  name: string;
  workflow_name?: string;
  conclusion: string;
  steps?: Array<{ name: string; number: number; conclusion: string | null }>;
};

function makeJobsResponse(jobs: JobStub[]): Response {
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

describe("triageFailingChecks — log boilerplate filter", () => {
  it("strips GitHub Actions runner setup lines and keeps the real error", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 1,
            name: "tests",
            workflow_name: "CI",
            conclusion: "failure",
            steps: [{ name: "Run tests", number: 1, conclusion: "failure" }],
          },
        ]),
      )
      .mockResolvedValueOnce(makeLogsRedirectResponse("https://s3.example.com/logs"))
      .mockResolvedValueOnce(
        makeLogTextResponse(
          [
            "##[group]Setting up runner",
            "2024-01-01T00:00:00.0000000Z ##[endgroup]",
            "2024-01-01T00:00:00.0000000Z [command]/usr/bin/git config --global advice.detachedHead false",
            "2024-01-01T00:00:00.0000000Z Run actions/checkout@v4",
            "2024-01-01T00:00:00.0000000Z with:",
            "2024-01-01T00:00:00.0000000Z env:",
            "2024-01-01T00:00:00.0000000Z Cache hit for restore key",
            "2024-01-01T00:00:00.0000000Z Download action repository actions/setup-node@v4",
            "2024-01-01T00:00:00.0000000Z Found in cache @ /opt/hostedtoolcache/node/20.0.0",
            "2024-01-01T00:00:00.0000000Z Received 1024 of 8192 bytes",
            "2024-01-01T00:00:00.0000000Z Cleaning up orphan processes",
            "##[error]Found 0 warnings and 2 errors.",
          ].join("\n"),
        ),
      );

    const results = await triageFailingChecks([makeCheck()], REPO, 5);
    expect(results).toHaveLength(1);
    const { logTail } = results[0]!;
    expect(logTail).toContain("##[error]Found 0 warnings and 2 errors.");
    expect(logTail).not.toContain("##[group]");
    expect(logTail).not.toContain("[command]");
    expect(logTail).not.toContain("Run actions/");
    expect(logTail).not.toContain("Cache hit");
    expect(logTail).not.toContain("Received 1024 of 8192 bytes");
  });

  it("preserves compiler diagnostics that resemble boilerplate prefixes", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 1,
            name: "tests",
            workflow_name: "CI",
            conclusion: "failure",
            steps: [{ name: "Run tests", number: 1, conclusion: "failure" }],
          },
        ]),
      )
      .mockResolvedValueOnce(makeLogsRedirectResponse("https://s3.example.com/logs"))
      .mockResolvedValueOnce(
        makeLogTextResponse(
          [
            "src/foo.ts(1,5): error TS2322: Type 'string' is not assignable to type 'number'.",
            "  Removing redundant type assertion (indented — not matched by ^Removing)",
            "Cache miss: no matching key (does not match cache filter)",
            "Found 3 errors in src/foo.ts (does not match ^Found in cache @)",
            "note: candidate found by name lookup is defined at src/bar.ts",
            "Received: 'foo' (jest diff output — not matched by ^Received \\d+ of \\d+)",
          ].join("\n"),
        ),
      );

    const results = await triageFailingChecks([makeCheck()], REPO, 10);
    expect(results).toHaveLength(1);
    const { logTail } = results[0]!;
    expect(logTail).toContain("src/foo.ts(1,5): error TS2322");
    expect(logTail).toContain("  Removing redundant type assertion");
    expect(logTail).toContain("Cache miss: no matching key");
    expect(logTail).toContain("Found 3 errors in src/foo.ts");
    expect(logTail).toContain("note: candidate found by name lookup");
    expect(logTail).toContain("Received: 'foo'");
  });

  it("falls back to original lines when every line is boilerplate", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeJobsResponse([
          {
            id: 1,
            name: "tests",
            workflow_name: "CI",
            conclusion: "failure",
            steps: [{ name: "Run tests", number: 1, conclusion: "failure" }],
          },
        ]),
      )
      .mockResolvedValueOnce(makeLogsRedirectResponse("https://s3.example.com/logs"))
      .mockResolvedValueOnce(
        makeLogTextResponse(
          ["##[group]Set up job", "##[endgroup]", "[command]/usr/bin/git init"].join("\n"),
        ),
      );

    const results = await triageFailingChecks([makeCheck()], REPO, 10);
    expect(results).toHaveLength(1);
    // When all lines are boilerplate the original unfiltered lines are used.
    expect(results[0]!.logTail).toContain("##[group]Set up job");
  });
});
