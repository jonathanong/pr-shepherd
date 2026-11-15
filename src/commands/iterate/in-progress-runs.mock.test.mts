import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../../config/resolve.mts";
import type { ClassifiedCheck, ShepherdReport } from "../../types.mts";

const { mockLoadConfig, mockReadFiles } = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockReadFiles: vi.fn(),
}));
vi.mock("../../config/load.mts", () => ({ loadConfig: mockLoadConfig }));
vi.mock("./workflow-files.mts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./workflow-files.mts")>()),
  readWorkflowFiles: mockReadFiles,
}));

import { buildInProgressRuns } from "./in-progress-runs.mts";

const CANCEL = "concurrency:\n  group: g\n  cancel-in-progress: true\n";

const check = (over: Partial<ClassifiedCheck> = {}): ClassifiedCheck => ({
  name: "build",
  status: "IN_PROGRESS",
  conclusion: null,
  detailsUrl: "",
  event: "pull_request",
  runId: "7",
  workflowName: "CI",
  workflowPath: ".github/workflows/ci.yml",
  category: "in_progress",
  ...over,
});

function report(
  inProgress: ClassifiedCheck[],
  over: Partial<ShepherdReport> = {},
  failing: unknown[] = [],
): ShepherdReport {
  return {
    repo: "owner/repo",
    pr: 42,
    baseBranch: "main",
    checks: { inProgress, failing, passing: [], skipped: [], filtered: [] },
    ...over,
  } as unknown as ShepherdReport;
}

function config(raw: Record<string, unknown> = {}) {
  mockLoadConfig.mockReturnValue(resolveConfig(raw, "test"));
}
const files = (entries: Record<string, { text: string } | { unreadable: string }>) =>
  mockReadFiles.mockImplementation(async () => new Map(Object.entries(entries)));
const ciKey = "refs/pull/42/merge:.github/workflows/ci.yml";

describe("buildInProgressRuns", () => {
  beforeEach(() => {
    mockReadFiles.mockReset();
    config();
  });

  it("recommends a cancel for a workflow whose cancel-in-progress is the literal true", async () => {
    files({ [ciKey]: { text: CANCEL } });
    const runs = await buildInProgressRuns(report([check()]), true);
    expect(runs).toEqual([
      {
        runId: "7",
        workflowName: "CI",
        status: "IN_PROGRESS",
        concurrency: "cancel-in-progress=true",
        cancelCommand: "gh run cancel 7 -R owner/repo",
      },
    ]);
    expect(mockReadFiles).toHaveBeenCalledWith({ owner: "owner", name: "repo" }, [
      { ref: "refs/pull/42/merge", path: ".github/workflows/ci.yml", pinned: false },
    ]);
  });

  it("prints an expression raw without a cancel", async () => {
    files({ [ciKey]: { text: "concurrency:\n  cancel-in-progress: ${{ github.ref != 'x' }}\n" } });
    const [run] = await buildInProgressRuns(report([check()]), true);
    expect(run).toMatchObject({ concurrency: "cancel-in-progress=${{ github.ref != 'x' }}" });
    expect(run).not.toHaveProperty("cancelCommand");
  });

  it("prints why a file is unreadable, and for YAML that does not parse", async () => {
    const concurrencyFor = async (entries: Parameters<typeof files>[0]) => {
      files(entries);
      return (await buildInProgressRuns(report([check()]), true))[0]!.concurrency;
    };
    expect(await concurrencyFor({ [ciKey]: { unreadable: "404" } })).toBe("unreadable (404)");
    expect(await concurrencyFor({ [ciKey]: { text: "a: [unclosed" } })).toBe(
      "unreadable (parse error)",
    );
    expect(await concurrencyFor({})).toBe("unreadable (no workflow file)");
  });

  it("names the missing file without a request when the run has no workflow path or base branch", async () => {
    files({});
    const noPath = await buildInProgressRuns(report([check({ workflowPath: undefined })]), true);
    expect(noPath[0]).toMatchObject({ concurrency: "unreadable (no workflow file)" });
    const target = check({ event: "pull_request_target" });
    const noHead = await buildInProgressRuns(report([target], { baseBranch: undefined }), true);
    expect(noHead[0]).toMatchObject({ concurrency: "unreadable (no workflow file)" });
    expect(mockReadFiles).toHaveBeenCalledWith({ owner: "owner", name: "repo" }, []);
  });

  it("tags a never-cancel match on the workflow name or any check name and withholds the cancel", async () => {
    files({ [ciKey]: { text: CANCEL } });
    config({ checks: { "never-cancel": ["nope", "ci"] } });
    const byWorkflow = await buildInProgressRuns(report([check()]), true);
    expect(byWorkflow[0]).toMatchObject({ neverCancel: "ci" });
    expect(byWorkflow[0]).not.toHaveProperty("cancelCommand");
    config({ checks: { "never-cancel": ["review *"] } });
    const sibling = [check(), check({ name: "Review Bot" }), check({ name: "review code" })];
    const byCheck = await buildInProgressRuns(report(sibling), true);
    expect(byCheck[0]).toMatchObject({ neverCancel: "review *" });
    expect(byCheck[0]).not.toHaveProperty("cancelCommand");
  });

  it("reports files unreadable instead of throwing when the read fails", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockReadFiles.mockRejectedValue(new Error("rate limited"));
    const [run] = await buildInProgressRuns(report([check()]), true);
    expect(run).toMatchObject({ concurrency: "unreadable (request failed)" });
    write.mockRestore();
  });

  it("withholds the cancel for a WAITING run and reports the waiting status", async () => {
    files({ [ciKey]: { text: CANCEL } });
    const runs = await buildInProgressRuns(
      report([check(), check({ name: "deploy", status: "WAITING" })]),
      true,
    );
    expect(runs[0]).toMatchObject({ status: "WAITING" });
    expect(runs[0]).not.toHaveProperty("cancelCommand");
  });

  it("withholds the cancel when the viewer cannot rerun workflows", async () => {
    files({ [ciKey]: { text: CANCEL } });
    const [run] = await buildInProgressRuns(report([check()]), false);
    expect(run).toMatchObject({ concurrency: "cancel-in-progress=true" });
    expect(run).not.toHaveProperty("cancelCommand");
  });

  it("lists failed and running siblings of the same run together", async () => {
    files({ [ciKey]: { text: CANCEL } });
    const failing = [
      { name: "tests", runId: "7" },
      { name: "other", runId: "8" },
    ];
    const runs = await buildInProgressRuns(
      report([check({ name: "e2e" }), check({ name: "lint" })], {}, failing),
      true,
    );
    expect(runs[0]).toMatchObject({ failed: ["tests"], running: ["e2e", "lint"] });
  });

  it("skips third-party checks, id-less checks and merge-queue checks", async () => {
    const checks = [
      check({ workflowName: undefined }),
      check({ runId: null }),
      check({ scope: "merge_group", runId: "9" }),
    ];
    expect(await buildInProgressRuns(report(checks), true)).toEqual([]);
    expect(await buildInProgressRuns(report([]), true)).toEqual([]);
    expect(mockReadFiles).not.toHaveBeenCalled();
  });

  it("reads a pull_request_target run's workflow from the live base branch, unpinned", async () => {
    files({ "main:.github/workflows/ci.yml": { text: CANCEL } });
    const runs = await buildInProgressRuns(report([check({ event: "pull_request_target" })]), true);
    expect(runs[0]).toMatchObject({ cancelCommand: "gh run cancel 7 -R owner/repo" });
    expect(mockReadFiles).toHaveBeenCalledWith({ owner: "owner", name: "repo" }, [
      { ref: "main", path: ".github/workflows/ci.yml", pinned: false },
    ]);
  });

  it("emits nothing and reads nothing when actions.cancel-runs-before-push is off", async () => {
    config({ actions: { "cancel-runs-before-push": false } });
    expect(await buildInProgressRuns(report([check()]), true)).toEqual([]);
    expect(mockReadFiles).not.toHaveBeenCalled();
  });

  it("emits nothing and reads nothing while the PR is in the merge queue", async () => {
    const queued = report([check()], { mergeQueue: { enabled: true, inQueue: true } });
    expect(await buildInProgressRuns(queued, true)).toEqual([]);
    expect(mockReadFiles).not.toHaveBeenCalled();
  });
});
