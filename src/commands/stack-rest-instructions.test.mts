import { describe, expect, it } from "vitest";
import { row, stack } from "../../test-helpers/commands/poll-summary-stack.test-support.mts";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { planPrefixDrain } from "./stack-drain.mts";
import { appendMarkReadyInstructions, splitStackWork } from "./stack-work.mts";
import {
  buildBranchPushInstruction,
  buildNativeStackRebaseInstruction,
} from "./iterate/native-stack-rebase.mts";

describe("REST native stack instructions", () => {
  it.each([
    [{ parentBranch: "parent" }, "parent branch `parent`"],
    [{ trunk: "main" }, "trunk `main`"],
    [{ bottomPr: 101 }, "bottom open layer PR #101"],
  ] as const)("preserves the caller's stack update boundary: %j", async (start, boundary) => {
    const instruction = await runWithGithubTransport("rest", async () =>
      buildNativeStackRebaseInstruction("acme/widgets", 9, start),
    );
    expect(instruction).toContain(boundary);
    expect(instruction).toContain("preserving the ordered parent boundaries");
    expect(instruction).not.toContain("gh stack");
    const push = await runWithGithubTransport("rest", async () =>
      buildBranchPushInstruction(instruction, true, " before review mutations"),
    );
    expect(push).toContain("push every affected stack branch");
    expect(push).toContain("before review mutations");
    expect(push).toContain("If no heads changed, do not push");
  });

  it("authorizes a cloud ready transition only after the bounded disabled-draft probe", () => {
    const draft = row(101, 1, {
      transport: "rest",
      isDraft: true,
      action: "wait",
      reasons: ["draft-auto-mark-ready-disabled"],
      pollProbe: true,
      pollCommand: "pr-shepherd probe-101",
    });
    const work = splitStackWork([draft], new Set());
    const instructions: string[] = [];
    appendMarkReadyInstructions(instructions, work.markReady);
    expect(instructions).toHaveLength(1);
    expect(instructions[0]).toContain("Run `pr-shepherd probe-101` first");
    expect(instructions[0]).toContain("pull/101 --transport rest");
    expect(instructions[0]).toContain("otherwise follow the probe's instructions");
  });

  it("requests a guarded merge of the ready prefix without GraphQL commands", async () => {
    await freshLoadConfig();
    const result = stack([row(1, 1, { readyReceipt: true, transport: "rest" }), row(2, 2)]);
    const plan = planPrefixDrain(result, true);
    expect(plan).toMatchObject({ action: "merge", stackMergeable: false });
    expect(plan?.instructions[0]).toContain(
      "--require-sha 0000000000000000000000000000000000000001",
    );
    expect(plan?.instructions[0]).toContain("--merge-action direct_merge");
    expect(plan?.instructions[0]).toContain("--transport rest");
    expect(plan?.instructions[0]).toContain("resume its UUID");
    expect(plan?.instructions[0]).not.toContain("gh stack merge");
  });

  it("does not guess queue policy for a configured direct merge method", async () => {
    writeRc("merge:\n  method: squash\n");
    await freshLoadConfig();
    const result = stack([
      row(1, 1, {
        readyReceipt: true,
        transport: "rest",
        transportUnavailable: [{ field: "branchRules", reason: "access denied" }],
      }),
    ]);
    const plan = planPrefixDrain(result, true);
    expect(plan).toMatchObject({ action: "escalate", stackMergeable: false });
    expect(plan?.instructions.join("\n")).toContain("cannot verify merge-queue policy");
    expect(plan?.instructions.join("\n")).not.toContain("apply merge");
  });
});
