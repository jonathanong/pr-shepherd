import { describe, expect, it, vi } from "vitest";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";
import { buildMergeCommandPlan } from "../commands/iterate/merge.mts";

function mergeArgv(allowed?: Array<"merge" | "squash" | "rebase">): string[] {
  const plan = buildMergeCommandPlan({
    pr: 42,
    repo: "owner/repo",
    nodeId: "PR_node",
    headSha: "abc123",
    queue: false,
    ...(allowed && { allowedMergeMethods: allowed }),
  });
  if ("unavailable" in plan) throw new Error(plan.unavailable);
  return plan.command.argv;
}

describe("loadConfig — merge.commandArgs", () => {
  it("defaults to empty", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.commandArgs).toEqual([]);
  });

  it("keeps command args without a strategy until the command is built", async () => {
    writeRc("merge:\n  commandArgs:\n    - --delete-branch\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.commandArgs).toEqual(["--delete-branch"]);
    expect(mergeArgv()).toEqual(expect.arrayContaining(["--delete-branch", "--merge"]));
  });

  it("preserves one configured merge strategy", async () => {
    writeRc("merge:\n  commandArgs:\n    - --squash\n    - --delete-branch\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.commandArgs).toEqual(["--squash", "--delete-branch"]);
    expect(mergeArgv()).toContain("--squash");
  });

  it("builds the merge-queue command plan", async () => {
    const { buildMergeCommandPlan } = await import("../commands/iterate/merge.mts");
    const plan = buildMergeCommandPlan({
      pr: 42,
      repo: "owner/repo",
      nodeId: "PR_node",
      headSha: "abc123",
      queue: true,
    });

    if ("unavailable" in plan) throw new Error(plan.unavailable);
    expect(plan.mode).toBe("queue");
    expect(plan.queueApiFallbackCommand?.argv).toContain("pullRequestId=PR_node");
  });

  it.each([
    ["--squash=true", ["--squash=true"]],
    ["-sd", ["-sd"]],
  ])("recognizes compound strategy form %s", async (arg, expected) => {
    writeRc(`merge:\n  commandArgs:\n    - ${arg}\n`);
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.commandArgs).toEqual(expected);
    expect(mergeArgv()).not.toContain("--merge");
  });

  it("treats an explicitly false strategy as inactive", async () => {
    writeRc("merge:\n  commandArgs:\n    - --squash=false\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.commandArgs).toEqual(["--squash=false"]);
    expect(mergeArgv()).toContain("--merge");
  });

  it("rejects Shepherd-owned args and falls back to defaults", async () => {
    writeRc("merge:\n  commandArgs:\n    - --repo=other/repo\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.commandArgs).toEqual([]);
    expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain("Shepherd-owned");
  });

  it.each([
    "--admin",
    "--body-file",
    "-F",
    "--help",
    "--help=true",
    "--help=false",
    "-h",
    "-h=true",
    "-hwat",
  ])("rejects unsafe %s", async (flag) => {
    writeRc(`merge:\n  commandArgs:\n    - ${flag}\n    - /sensitive/path\n`);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.commandArgs).toEqual([]);
    expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain("Shepherd-owned");
  });

  it.each(["-Rattacker/repo", "-F/sensitive/path", "--disable-auto"])(
    "rejects attached or conflicting %s",
    async (arg) => {
      writeRc(`merge:\n  commandArgs:\n    - ${arg}\n`);
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const loadConfig = await freshLoadConfig();
      expect(loadConfig().merge?.commandArgs).toEqual([]);
      expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain("Shepherd-owned");
    },
  );

  it("rejects a non-array commandArgs value", async () => {
    writeRc("merge:\n  commandArgs: --delete-branch\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.commandArgs).toEqual([]);
    expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain("array of strings");
  });

  it("rejects multiple strategies and falls back to defaults", async () => {
    writeRc("merge:\n  commandArgs:\n    - --squash\n    - --rebase\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.commandArgs).toEqual([]);
    expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain("multiple merge strategies");
  });

  it.each(["-ms", "--squash=true\n    - --rebase"])(
    "rejects compound multiple strategies in %s",
    async (args) => {
      writeRc(`merge:\n  commandArgs:\n    - ${args}\n`);
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const loadConfig = await freshLoadConfig();
      expect(loadConfig().merge?.commandArgs).toEqual([]);
      expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain("multiple merge strategies");
    },
  );

  it("uses squash when the repository disables merge commits", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.method).toBeUndefined();
    expect(mergeArgv(["squash"])).toContain("--squash");
    expect(mergeArgv(["squash"])).not.toContain("--merge");
  });

  it("reads merge.method from yaml", async () => {
    writeRc("merge:\n  method: rebase\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.method).toBe("rebase");
    expect(mergeArgv(["merge", "rebase"])).toContain("--rebase");
  });

  it("does not suggest a configured method the repository disables", async () => {
    writeRc("merge:\n  method: merge\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.method).toBe("merge");
    const plan = buildMergeCommandPlan({
      pr: 42,
      repo: "owner/repo",
      nodeId: "PR_node",
      headSha: "abc123",
      queue: false,
      allowedMergeMethods: ["squash"],
    });
    expect(plan).toMatchObject({
      unavailable:
        "Configured merge method `merge` is not allowed by this repository. Allowed methods: squash.",
    });
  });

  it.each(["--squash=maybe", "-sfoo", "-dR"])(
    "rejects ambiguous strategy syntax %s",
    async (arg) => {
      writeRc(`merge:\n  commandArgs:\n    - ${arg}\n`);
      const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      const loadConfig = await freshLoadConfig();
      expect(loadConfig().merge?.commandArgs).toEqual([]);
      expect(stderrSpy).toHaveBeenCalled();
    },
  );
});
