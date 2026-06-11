import { vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Stub fetch globally so http.mts uses our mock.
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { fetchStartupFailureChecks, triageFailingChecks } from "../../src/checks/triage.mts";
import { mergeStartupFailureChecks } from "../../src/checks/startup-failures.mts";
import type { ClassifiedCheck } from "../../src/types.mts";

const REPO = { owner: "owner", name: "repo" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  id?: number;
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

function makeErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    headers: new Headers(),
    text: () => Promise.resolve("error"),
  } as unknown as Response;
}

function makeTextResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "text/plain" }),
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

function makeWorkflowRunsResponse(runs: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve({ workflow_runs: runs }),
    text: () => Promise.resolve(JSON.stringify({ workflow_runs: runs })),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

export function registerHooks(): void {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env["GH_TOKEN"] = "test-token";
  });
}

export {
  REPO,
  fetchStartupFailureChecks,
  makeCheck,
  makeErrorResponse,
  makeJobsResponse,
  makeTextResponse,
  makeWorkflowRunsResponse,
  mergeStartupFailureChecks,
  mockFetch,
  triageFailingChecks,
};
export type { ClassifiedCheck, JobStub };
