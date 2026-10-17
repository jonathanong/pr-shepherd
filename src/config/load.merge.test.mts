import { describe, expect, it } from "vitest";
import {
  expectConfigError,
  freshLoadConfig,
  tmpPath,
  writeRc,
  writeRcAt,
} from "../../test-helpers/config/load-test-support.mts";
import { buildMergeCommandPlan, unavailableMergeResult } from "../commands/iterate/merge.mts";
import type { IterateResultBase } from "../types.mts";

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

describe("loadConfig — merge.command-args", () => {
  it("defaults to empty", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge["command-args"]).toEqual([]);
  });

  it("keeps command args without a strategy until the command is built", async () => {
    writeRc("merge:\n  command-args:\n    - --delete-branch\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge["command-args"]).toEqual(["--delete-branch"]);
    expect(mergeArgv()).toEqual(expect.arrayContaining(["--delete-branch", "--merge"]));
  });

  it("preserves one configured merge strategy", async () => {
    writeRc("merge:\n  command-args:\n    - --squash\n    - --delete-branch\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge["command-args"]).toEqual(["--squash", "--delete-branch"]);
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
    writeRc(`merge:\n  command-args:\n    - ${arg}\n`);
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge["command-args"]).toEqual(expected);
    expect(mergeArgv()).not.toContain("--merge");
  });

  it("treats an explicitly false strategy as inactive", async () => {
    writeRc("merge:\n  command-args:\n    - --squash=false\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge["command-args"]).toEqual(["--squash=false"]);
    expect(mergeArgv()).toContain("--merge");
  });

  it("rejects Shepherd-owned args", async () => {
    writeRc("merge:\n  command-args:\n    - --repo=other/repo\n");
    await expectConfigError(".pr-shepherdrc.yml", "`merge.command-args`", "Shepherd-owned");
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
    writeRc(`merge:\n  command-args:\n    - ${flag}\n    - /sensitive/path\n`);
    await expectConfigError(".pr-shepherdrc.yml", "`merge.command-args`", "Shepherd-owned");
  });

  it.each(["-Rattacker/repo", "-F/sensitive/path", "--disable-auto"])(
    "rejects attached or conflicting %s",
    async (arg) => {
      writeRc(`merge:\n  command-args:\n    - ${arg}\n`);
      await expectConfigError("`merge.command-args`");
    },
  );

  it("rejects a non-array command-args value", async () => {
    writeRc("merge:\n  command-args: --delete-branch\n");
    await expectConfigError(".pr-shepherdrc.yml", "`merge.command-args`", "expected array");
  });

  it("rejects multiple strategies", async () => {
    writeRc("merge:\n  command-args:\n    - --squash\n    - --rebase\n");
    await expectConfigError(
      ".pr-shepherdrc.yml",
      "`merge.command-args`",
      "multiple merge strategies",
    );
  });

  it.each(["-ms", "--squash=true\n    - --rebase"])(
    "rejects compound multiple strategies in %s",
    async (args) => {
      writeRc(`merge:\n  command-args:\n    - ${args}\n`);
      await expectConfigError("`merge.command-args`");
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

  it("rejects a method that disagrees with commandArgs", async () => {
    writeRc("merge:\n  method: merge\n  command-args:\n    - --squash\n");
    await expectConfigError(".pr-shepherdrc.yml", "`merge.command-args`", "conflicts");
  });

  it("checks method and command-args together after merging files", async () => {
    writeRc("merge:\n  method: merge\n");
    writeRcAt("nested", "merge:\n  command-args:\n    - --squash\n");
    process.chdir(tmpPath("nested"));
    await expectConfigError(
      `invalid config in ${tmpPath("nested", ".pr-shepherdrc.yml")}, ${tmpPath(".pr-shepherdrc.yml")}`,
      "`merge.method` merge conflicts with the `merge.command-args` strategy squash",
    );
  });

  it("escalates when the selected method is unavailable", () => {
    const result = unavailableMergeResult(
      { pr: 42, repo: "acme/widgets" } as IterateResultBase,
      { pr: 42, repo: "acme/widgets" },
      "Configured merge method `merge` is not allowed by this repository. Allowed methods: squash.",
    );
    expect(result.action).toBe("escalate");
    if (result.action !== "escalate") return;
    expect(result.escalate.triggers).toEqual(["merge-method-unavailable"]);
    expect(result.escalate.humanMessage).toContain("Allowed methods: squash");
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
      writeRc(`merge:\n  command-args:\n    - ${arg}\n`);
      await expectConfigError("`merge.command-args`");
    },
  );
});
