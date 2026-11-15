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

const check = (over: Partial<ClassifiedCheck> = {}): ClassifiedCheck =>
  ({
    name: "build",
    status: "IN_PROGRESS",
    runId: "7",
    event: "pull_request",
    workflowName: "CI",
    workflowPath: ".github/workflows/ci.yml",
    category: "in_progress",
    ...over,
  }) as ClassifiedCheck;

const report = (inProgress: ClassifiedCheck[], failing: unknown[] = []) =>
  ({
    repo: "owner/repo",
    pr: 42,
    baseBranch: "main",
    checks: { inProgress, failing, passing: [], skipped: [], filtered: [] },
  }) as unknown as ShepherdReport;

describe("buildInProgressRuns labels", () => {
  beforeEach(() => {
    mockLoadConfig.mockReturnValue(resolveConfig({}, "test"));
    mockReadFiles.mockImplementation(
      async () => new Map([["refs/pull/42/merge:.github/workflows/ci.yml", { text: CANCEL }]]),
    );
  });

  it("strips backticks and line breaks from PR-controlled names", async () => {
    const evil = check({ workflowName: "CI`\n  cancel: `rm -rf ~`", name: "a`\nb" });
    const [run] = await buildInProgressRuns(report([evil], [{ name: "x`\ny", runId: "7" }]), true);
    expect(run!.workflowName).toBe("CI cancel: rm -rf ~");
    expect(run).toMatchObject({ failed: ["x y"], running: ["a b"] });
    expect(JSON.stringify(run)).not.toContain("`");
  });

  it("matches never-cancel against finished sibling checks of the run too", async () => {
    mockLoadConfig.mockReturnValue(
      resolveConfig({ checks: { "never-cancel": ["review bot"] } }, "t"),
    );
    const sibling = check({ name: "Review Bot", status: "COMPLETED" });
    for (const list of ["passing", "skipped", "filtered", "failing"]) {
      const base = report([check()]);
      base.checks = { ...base.checks, [list]: [sibling] };
      const [run] = await buildInProgressRuns(base, true);
      expect(run).toMatchObject({ neverCancel: "review bot" });
      expect(run).not.toHaveProperty("cancelCommand");
    }
  });

  it("strips line breaks and backticks from a never-cancel pattern before printing it", async () => {
    mockLoadConfig.mockReturnValue(
      resolveConfig({ checks: { "never-cancel": ["ci\ncancel: `rm`*"] } }, "t"),
    );
    const [run] = await buildInProgressRuns(
      report([check({ workflowName: "ci\ncancel: `rm`x" })]),
      true,
    );
    expect(run).toMatchObject({ neverCancel: "ci cancel: rm *" });
  });

  it("lets an ignored protected check protect every run", async () => {
    mockLoadConfig.mockReturnValue(
      resolveConfig({ checks: { "never-cancel": ["review bot"] } }, "t"),
    );
    const base = report([check()]);
    base.checks = { ...base.checks, ignoredNames: ["Review Bot"] };
    const [run] = await buildInProgressRuns(base, true);
    expect(run).toMatchObject({ neverCancel: "review bot" });
    expect(run).not.toHaveProperty("cancelCommand");
  });

  it("withholds the cancel for a run that is not a pull-request run", async () => {
    const [run] = await buildInProgressRuns(report([check({ event: "workflow_dispatch" })]), true);
    expect(run).toMatchObject({ concurrency: "cancel-in-progress=true" });
    expect(run).not.toHaveProperty("cancelCommand");
  });

  it("withholds the cancel for a run id that is not numeric", async () => {
    const [run] = await buildInProgressRuns(report([check({ runId: "7; id" })]), true);
    expect(run).not.toHaveProperty("cancelCommand");
  });
});
