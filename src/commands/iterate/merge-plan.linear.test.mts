import { describe, expect, it } from "vitest";
import { freshLoadConfig } from "../../../test-helpers/config/load-test-support.mts";

const input = {
  pr: 101,
  repo: "octocat/hello-world",
  nodeId: "PR_101",
  headSha: "a".repeat(40),
  queue: false,
};

describe("merge command method under required linear history", () => {
  it("prints --method squash on REST instead of a merge commit", async () => {
    await freshLoadConfig();
    const { buildMergeCommandPlan } = await import("./merge-plan.mts");
    const plan = buildMergeCommandPlan({
      ...input,
      transport: "rest",
      queueKnown: true,
      allowedMergeMethods: ["merge", "squash"],
      linearHistory: true,
    });
    if ("unavailable" in plan) throw new Error(plan.unavailable);
    expect(plan.command.argv).toEqual(expect.arrayContaining(["--method", "squash"]));
  });

  it("prints --squash and a REST fallback with the same method on GraphQL", async () => {
    await freshLoadConfig();
    const { buildMergeCommandPlan } = await import("./merge-plan.mts");
    const plan = buildMergeCommandPlan({ ...input, linearHistory: true, restFallback: true });
    if ("unavailable" in plan) throw new Error(plan.unavailable);
    expect(plan.command.argv).toContain("--squash");
    expect(plan.restFallbackCommand?.argv).toEqual([
      "gh",
      "api",
      "-X",
      "PUT",
      "repos/octocat/hello-world/pulls/101/merge",
      "-f",
      `sha=${"a".repeat(40)}`,
      "-f",
      "merge_method=squash",
    ]);
  });

  it("omits the REST fallback unless requested", async () => {
    await freshLoadConfig();
    const { buildMergeCommandPlan } = await import("./merge-plan.mts");
    expect(buildMergeCommandPlan(input)).not.toHaveProperty("restFallbackCommand");
    expect(buildMergeCommandPlan({ ...input, queue: true, restFallback: true })).not.toHaveProperty(
      "restFallbackCommand",
    );
  });
});
