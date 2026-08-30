import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import {
  registerHooks,
  REPO,
  makeCheck,
  makeJobsResponse,
  makeTextResponse,
  mockFetch,
  triageFailingChecks,
} from "../../test-helpers/checks/triage.test-support.mts";

registerHooks();

const stateKey = { owner: REPO.owner, repo: REPO.name, pr: 7 };
let testStateDir: string;

beforeEach(() => {
  testStateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-triage-joblog-test-${randomBytes(4).toString("hex")}`;
  process.env["PR_SHEPHERD_STATE_DIR"] = testStateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(testStateDir, { recursive: true, force: true });
});

/** A job whose conclusion is still null — mimics an in-progress job. */
function inProgressJobsResponse(): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: () =>
      Promise.resolve({
        jobs: [{ id: 555, name: "tests", workflow_name: "CI", conclusion: null }],
      }),
    text: () => Promise.resolve(""),
  } as unknown as Response;
}

describe("triageFailingChecks — cross-tick job log excerpt cache", () => {
  const job = {
    id: 555,
    name: "tests",
    workflow_name: "CI",
    conclusion: "failure",
    steps: [{ name: "run", number: 1, conclusion: "failure" as const }],
  };

  it("skips restText on the second tick once the excerpt is cached", async () => {
    mockFetch
      .mockResolvedValueOnce(makeJobsResponse([job]))
      .mockResolvedValueOnce(makeTextResponse("##[error]boom"));

    const [first] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO, stateKey);
    expect(first?.logExcerpt).toContain("boom");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce(makeJobsResponse([job]));

    const [second] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO, stateKey);
    expect(second?.logExcerpt).toContain("boom");
    // Only the jobs-list call — restText is skipped because the excerpt is cached.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not cache the log while the matched job is still in progress", async () => {
    mockFetch
      .mockResolvedValueOnce(inProgressJobsResponse())
      .mockResolvedValueOnce(makeTextResponse("partial output"));

    const [firstTick] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO, stateKey);
    expect(firstTick?.logExcerpt).toContain("partial output");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    mockFetch.mockClear();
    mockFetch
      .mockResolvedValueOnce(makeJobsResponse([job]))
      .mockResolvedValueOnce(makeTextResponse("##[error]boom"));

    const [second] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO, stateKey);
    expect(second?.logExcerpt).toContain("boom");
    // Not cached last tick (job wasn't terminal yet), so restText runs again.
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not cache when stateKey is omitted", async () => {
    mockFetch
      .mockResolvedValueOnce(makeJobsResponse([job]))
      .mockResolvedValueOnce(makeTextResponse("##[error]boom"))
      .mockResolvedValueOnce(makeJobsResponse([job]))
      .mockResolvedValueOnce(makeTextResponse("##[error]boom"));

    await triageFailingChecks([makeCheck({ name: "tests" })], REPO);
    await triageFailingChecks([makeCheck({ name: "tests" })], REPO);

    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});
