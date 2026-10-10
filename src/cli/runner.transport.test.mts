import { describe, expect, it } from "vitest";
import { buildPrShepherdCommand } from "./runner.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { buildMergeCommandPlan } from "../commands/iterate/merge.mts";

describe("resumable REST commands", () => {
  it("retains REST transport in generated commands after the caller exits", async () => {
    await runWithGithubTransport("rest", async () => {
      const command = buildPrShepherdCommand(["apply", "review", "101"]);
      expect(command.argv.slice(-2)).toEqual(["--transport", "rest"]);
      const explicit = buildPrShepherdCommand(["iterate", "101", "--transport", "graphql"]);
      expect(explicit.argv.filter((arg) => arg === "--transport")).toHaveLength(1);
    });
  });

  it("renders an authoritative REST snapshot with no implicit GraphQL merge commands", () => {
    const plan = buildMergeCommandPlan({
      transport: "rest",
      pr: 101,
      repo: "octocat/hello-world",
      nodeId: "opaque",
      headSha: "a".repeat(40),
      queue: false,
    });
    if ("unavailable" in plan) throw new Error(plan.unavailable);
    expect(plan.mode).toBe("rest");
    expect(plan.command.argv).toContain("default");
    expect(plan.command.argv).not.toContain("--method");
    expect(plan.command.argv).not.toContain("gh");
    expect(plan).not.toHaveProperty("queueApiFallbackCommand");
  });
});
