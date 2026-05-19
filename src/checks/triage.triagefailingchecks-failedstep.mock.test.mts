import { describe, it, expect, vi } from "vitest";
import {
  registerHooks,
  REPO,
  makeCheck,
  makeErrorResponse,
  makeJobsResponse,
  mockFetch,
  triageFailingChecks,
} from "./triage.test-support.mts";

registerHooks();

describe("triageFailingChecks — failedStep", () => {
  it("extracts failedStep + workflowName + jobName from matching job", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          name: "tests",
          workflow_name: "CI",
          conclusion: "failure",
          steps: [
            { name: "Set up job", number: 1, conclusion: "success" },
            { name: "Run tests", number: 2, conclusion: "failure" },
            { name: "Post", number: 3, conclusion: null },
          ],
        },
      ]),
    );
    const [result] = await triageFailingChecks([makeCheck()], REPO);
    expect(result!.workflowName).toBe("CI");
    expect(result!.jobName).toBe("tests");
    expect(result!.failedStep).toBe("Run tests");
  });

  it("failedStep=undefined when job has no failed steps", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([{ name: "tests", conclusion: "failure", steps: [] }]),
    );
    const [result] = await triageFailingChecks([makeCheck()], REPO);
    expect(result!.failedStep).toBeUndefined();
  });

  it("failedStep=undefined when no job matches check name", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          name: "some-other-job",
          conclusion: "failure",
          steps: [{ name: "Run tests", number: 1, conclusion: "failure" }],
        },
      ]),
    );
    const [result] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO);
    expect(result!.failedStep).toBeUndefined();
  });

  it("prefers failing job when multiple jobs share the same check name (matrix)", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          name: "tests",
          conclusion: "success",
          steps: [{ name: "Run tests", number: 1, conclusion: "success" }],
        },
        {
          name: "tests",
          conclusion: "failure",
          steps: [{ name: "Run tests", number: 1, conclusion: "failure" }],
        },
      ]),
    );
    const [result] = await triageFailingChecks([makeCheck({ name: "tests" })], REPO);
    expect(result!.failedStep).toBe("Run tests");
  });

  it("falls back to matchedJobs[0] when no job has a non-success conclusion", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          name: "tests",
          conclusion: null as unknown as string,
          steps: [],
        },
      ]),
    );
    const [result] = await triageFailingChecks([makeCheck()], REPO);
    expect(result!.jobName).toBe("tests");
    expect(result!.failedStep).toBeUndefined();
  });

  it("falls back to prefix match for matrix jobs when no exact name match", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJobsResponse([
        {
          name: "build (ubuntu)",
          conclusion: "failure",
          steps: [{ name: "Compile", number: 1, conclusion: "failure" }],
        },
        {
          name: "build (windows)",
          conclusion: "success",
          steps: [{ name: "Compile", number: 1, conclusion: "success" }],
        },
      ]),
    );
    const [result] = await triageFailingChecks([makeCheck({ name: "build" })], REPO);
    expect(result!.failedStep).toBe("Compile");
  });

  it("no job info when jobs fetch throws", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500));
    const [result] = await triageFailingChecks([makeCheck({ conclusion: "FAILURE" })], REPO);
    expect(result!.failedStep).toBeUndefined();
  });

  it("warns and returns accumulated jobs when job pagination reaches the cap", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      for (let page = 0; page < 20; page++) {
        mockFetch.mockResolvedValueOnce(
          makeJobsResponse(
            Array.from({ length: 100 }, (_, i) => ({
              name: page === 0 && i === 0 ? "tests" : `job-${page}-${i}`,
              workflow_name: "CI",
              conclusion: page === 0 && i === 0 ? "failure" : "success",
              steps:
                page === 0 && i === 0
                  ? [{ name: "Run tests", number: 1, conclusion: "failure" }]
                  : [],
            })),
          ),
        );
      }

      const [result] = await triageFailingChecks([makeCheck()], REPO);

      expect(result!.failedStep).toBe("Run tests");
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("job pagination cap"));
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
