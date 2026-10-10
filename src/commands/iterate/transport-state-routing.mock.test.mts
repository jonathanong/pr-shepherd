import { describe, expect, it } from "vitest";
import {
  makeReport,
  registerIterateHooks,
} from "../../../test-helpers/commands/iterate-test-support.mts";
import { buildIterateBase } from "./base.mts";
import { buildReadyMergeOutcome } from "./merge-state.mts";
import { markReadyIfAuthorized } from "./mark-ready.mts";
import { runWithGithubTransport } from "../../github/transport.mts";

registerIterateHooks();
const ready = { shouldCancel: true, remainingSeconds: 0 };

describe("transport-aware ready state routing", () => {
  it("does not invent direct merge policy when REST branch rules are unavailable", () => {
    const report = makeReport({
      transport: "rest",
      transportUnavailable: [{ field: "branchRules", reason: "unavailable" }],
      headSha: "a".repeat(40),
    });
    const result = buildReadyMergeOutcome(true, true, buildIterateBase(report, ready), report);
    expect(result?.action).toBe("merge");
    if (result?.action !== "merge") throw new Error("Expected guarded REST merge plan");
    expect(result.merge.command.argv).toEqual(
      expect.arrayContaining(["--merge-action", "default", "--transport", "rest"]),
    );
    expect(result.merge.command.argv).not.toContain("--method");
  });

  it("does not trust unknown REST capabilities when a GraphQL session resumes", async () => {
    const report = makeReport({ transport: "rest", viewerAuthorization: undefined });
    const result = await runWithGithubTransport("graphql", () =>
      markReadyIfAuthorized(true, buildIterateBase(report, ready), report),
    );
    expect(result).toMatchObject({
      action: "escalate",
      escalate: { triggers: ["transport-unsupported"] },
    });
  });
});
