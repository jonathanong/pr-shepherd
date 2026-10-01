import { describe, it, expect } from "vitest";
import {
  registerHooks,
  REPO,
  makeCheck,
  makeErrorResponse,
  makeJobsResponse,
  makeTextResponse,
  mockFetch,
  triageFailingChecks,
} from "../../test-helpers/checks/triage.test-support.mts";
import type { JobStub } from "../../test-helpers/checks/triage.test-support.mts";

registerHooks();

const step = [{ name: "Run tests", number: 1, conclusion: "failure" }];

function routeFetch(jobs: JobStub[], logs: Record<number, Response> = {}): void {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("/jobs?filter=latest")) return Promise.resolve(makeJobsResponse(jobs));
    const id = Number(/jobs\/(\d+)\/logs/.exec(url)?.[1]);
    return Promise.resolve(logs[id] ?? makeTextResponse(`##[error]log of job ${id}`));
  });
}

function logFetchCount(): number {
  return (mockFetch.mock.calls as Array<[string]>).filter(([url]) => url.includes("/logs")).length;
}

describe("triageFailingChecks — related failed jobs", () => {
  it("attaches sibling failed jobs with failed step and log tail", async () => {
    routeFetch([
      { id: 1, name: "gate", conclusion: "failure", steps: step },
      { id: 2, name: "test-a", conclusion: "failure", steps: step },
      { id: 3, name: "test-b", conclusion: "timed_out" },
      { id: 4, name: "lint", conclusion: "success" },
      { id: 5, name: "other", conclusion: "cancelled" },
    ]);
    const [gate] = await triageFailingChecks([makeCheck({ name: "gate" })], REPO);
    expect(gate?.relatedJobs).toEqual([
      {
        name: "test-a",
        conclusion: "FAILURE",
        failedStep: "Run tests",
        logExcerpt: "##[error]log of job 2",
      },
      { name: "test-b", conclusion: "TIMED_OUT", logExcerpt: "##[error]log of job 3" },
    ]);
  });

  it("skips jobs already surfaced as their own failing check and reports once per run", async () => {
    routeFetch([
      { id: 1, name: "gate", conclusion: "failure" },
      { id: 2, name: "test-a", conclusion: "failure" },
      { id: 3, name: "hidden", conclusion: "failure" },
    ]);
    const results = await triageFailingChecks(
      [makeCheck({ name: "gate" }), makeCheck({ name: "test-a" })],
      REPO,
    );
    expect(results[0]?.relatedJobs?.map((j) => j.name)).toEqual(["hidden"]);
    expect(results[1]?.relatedJobs).toBeUndefined();
    expect(logFetchCount()).toBe(3);
  });

  it("omits relatedJobs when no sibling failed, and for cancelled checks", async () => {
    routeFetch([
      { id: 1, name: "gate", conclusion: "failure" },
      { id: 2, name: "x", conclusion: "failure" },
    ]);
    const [cancelled] = await triageFailingChecks(
      [makeCheck({ name: "gate", conclusion: "CANCELLED" })],
      REPO,
    );
    expect(cancelled?.relatedJobs).toBeUndefined();
    routeFetch([{ id: 1, name: "gate", conclusion: "failure" }]);
    const [alone] = await triageFailingChecks([makeCheck({ name: "gate" })], REPO);
    expect(alone?.relatedJobs).toBeUndefined();
  });

  it("lets the first non-cancelled check own the related jobs", async () => {
    routeFetch([
      { id: 1, name: "gate", conclusion: "failure" },
      { id: 2, name: "early", conclusion: "cancelled" },
      { id: 3, name: "child", conclusion: "failure" },
    ]);
    const results = await triageFailingChecks(
      [makeCheck({ name: "early", conclusion: "CANCELLED" }), makeCheck({ name: "gate" })],
      REPO,
    );
    expect(results[0]?.relatedJobs).toBeUndefined();
    expect(results[1]?.relatedJobs?.map((j) => j.name)).toEqual(["child"]);
  });

  it("caps sibling jobs at five", async () => {
    routeFetch([
      { id: 1, name: "gate", conclusion: "failure" },
      ...Array.from({ length: 8 }, (_, i) => ({
        id: 10 + i,
        name: `child-${i}`,
        conclusion: "failure",
      })),
    ]);
    const [gate] = await triageFailingChecks([makeCheck({ name: "gate" })], REPO);
    expect(gate?.relatedJobs).toHaveLength(5);
    expect(logFetchCount()).toBe(6);
  });

  it("keeps a sibling without an id or a log when its log cannot be fetched", async () => {
    routeFetch(
      [
        { id: 1, name: "gate", conclusion: "failure" },
        { name: "no-id", conclusion: "failure" },
        { id: 3, name: "broken-log", conclusion: "failure" },
      ],
      { 3: makeErrorResponse(404) },
    );
    const [gate] = await triageFailingChecks([makeCheck({ name: "gate" })], REPO);
    expect(gate?.relatedJobs).toEqual([
      { name: "no-id", conclusion: "FAILURE" },
      { name: "broken-log", conclusion: "FAILURE" },
    ]);
  });
});
