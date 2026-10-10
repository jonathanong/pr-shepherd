import { describe, expect, it } from "vitest";
import { freshLoadConfig, writeRc } from "../../../test-helpers/config/load-test-support.mts";

const input = {
  transport: "rest" as const,
  pr: 101,
  repo: "octocat/hello-world",
  nodeId: "PR_101",
  headSha: "a".repeat(40),
  queue: false,
  allowedMergeMethods: ["merge", "squash"] as const,
};
describe("REST generated merge command policy", () => {
  it.each([
    { configured: "squash", allowed: ["merge"] as const },
    { configured: undefined, allowed: [] as const },
  ])(
    "does not validate direct merge methods for a required queue: %j",
    async ({ configured, allowed }) => {
      if (configured) writeRc(`merge:\n  method: ${configured}\n`);
      await freshLoadConfig();
      const { buildMergeCommandPlan } = await import("./merge-plan.mts");
      const plan = buildMergeCommandPlan({
        ...input,
        queue: true,
        queueKnown: true,
        allowedMergeMethods: allowed,
      });
      if ("unavailable" in plan) throw new Error(plan.unavailable);
      expect(plan.command.argv).toEqual(expect.arrayContaining(["--merge-action", "merge_queue"]));
      expect(plan.command.argv).not.toContain("--method");
    },
  );

  it("does not validate direct merge methods for an automatic request without configured method", async () => {
    await freshLoadConfig();
    const { buildMergeCommandPlan } = await import("./merge-plan.mts");
    const plan = buildMergeCommandPlan({ ...input, allowedMergeMethods: [] });
    if ("unavailable" in plan) throw new Error(plan.unavailable);
    expect(plan.command.argv).toEqual(expect.arrayContaining(["--merge-action", "default"]));
    expect(plan.command.argv).not.toContain("--method");
  });

  it("still rejects an unavailable configured method for a known direct merge", async () => {
    writeRc("merge:\n  method: squash\n");
    await freshLoadConfig();
    const { buildMergeCommandPlan } = await import("./merge-plan.mts");
    expect(
      buildMergeCommandPlan({ ...input, queueKnown: true, allowedMergeMethods: ["merge"] }),
    ).toHaveProperty("unavailable");
  });

  it("retains an expected native-stack prefix in the guarded REST command", async () => {
    await freshLoadConfig();
    const { buildMergeCommandPlan } = await import("./merge-plan.mts");
    const expectedStack = {
      number: 42,
      baseRefName: "main",
      prefix: [
        { pr: input.pr, headRefName: "feature", headRefOid: input.headSha, baseRefName: "main" },
      ],
    };
    const plan = buildMergeCommandPlan({ ...input, queue: true, expectedStack });
    if ("unavailable" in plan) throw new Error(plan.unavailable);
    const index = plan.command.argv.indexOf("--expected-stack");
    expect(index).toBeGreaterThan(0);
    expect(JSON.parse(plan.command.argv[index + 1]!)).toEqual(expectedStack);
    expect(plan.command.argv).not.toContain("--method");
  });

  it("does not lose a configured method when merge-queue policy is unknown", async () => {
    writeRc("merge:\n  method: squash\n");
    await freshLoadConfig();
    const { buildMergeCommandPlan } = await import("./merge-plan.mts");
    const plan = buildMergeCommandPlan(input);
    expect(plan).toHaveProperty("unavailable");
    expect(plan).not.toHaveProperty("command");
  });
  it("generates a guarded direct REST request preserving a configured method when no queue is known", async () => {
    writeRc("merge:\n  method: squash\n");
    await freshLoadConfig();
    const { buildMergeCommandPlan } = await import("./merge-plan.mts");
    const plan = buildMergeCommandPlan({ ...input, queueKnown: true });
    if ("unavailable" in plan) throw new Error(plan.unavailable);
    expect(plan.command.argv).toEqual(
      expect.arrayContaining([
        "apply",
        "merge",
        "--require-sha",
        input.headSha,
        "--merge-action",
        "direct_merge",
        "--method",
        "squash",
        "--transport",
        "rest",
      ]),
    );
    expect(plan.command.argv).not.toContain("graphql");
  });
  it("uses default without a direct merge method when queue policy is unknown and no method is configured", async () => {
    await freshLoadConfig();
    const { buildMergeCommandPlan } = await import("./merge-plan.mts");
    const plan = buildMergeCommandPlan(input);
    if ("unavailable" in plan) throw new Error(plan.unavailable);
    expect(plan.command.argv).toEqual(
      expect.arrayContaining(["--merge-action", "default", "--transport", "rest"]),
    );
    expect(plan.command.argv).not.toContain("--method");
    expect(plan.command.argv).not.toContain("graphql");
  });
});
