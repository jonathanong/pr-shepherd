import { describe, it, expect } from "vitest";
import { buildPushSteps } from "./triage-loop-instruction.mts";
import { buildFixInstructions } from "./render.mts";
import type { AgentCheck, FirstLookComment } from "../../types.mts";

const resolveCommand = {
  argv: ["pr-shepherd", "resolve", "42"],
  requiresHeadSha: true,
  requiresDismissMessage: false,
  hasMutations: true,
};

describe("buildPushSteps", () => {
  it("folds the push procedure into a playbook pointer without prescribing a journal", () => {
    const text = buildPushSteps("playbook", true).join("\n");
    expect(text).toContain("Commit and push any changes.");
    expect(text).toContain('Playbook: "Triage loop".');
    expect(text).toContain('CLI: `pr-shepherd playbook "Triage loop"`.');
    expect(text).not.toContain("journal");
  });

  it("leaves specialized push procedures intact", () => {
    expect(buildPushSteps("playbook", false)).toEqual([]);
  });

  it("keeps the generic push inline", () => {
    expect(buildPushSteps("inline", true)).toEqual(["Commit and push any changes."]);
  });
});

describe("buildFixInstructions instruction style", () => {
  const call = (style: "inline" | "playbook", viewerCanUpdate: boolean) =>
    buildFixInstructions(
      [],
      [],
      [],
      [
        {
          id: "r-1",
          author: "rev",
          authorType: "Unknown" as const,
          body: "Please fix.",
        },
      ],
      "main",
      resolveCommand,
      false,
      42,
      [],
      [],
      [],
      [],
      [],
      undefined,
      "",
      false,
      viewerCanUpdate,
      false,
      undefined,
      undefined,
      style,
    );

  it("playbook style renders the push procedure without a journal requirement", () => {
    const text = call("playbook", true).join("\n");
    expect(text).toContain('Playbook: "Triage loop"');
    expect(text).toContain("Optional: If you reject a code review suggestion");
    expect(text).toContain("`pr-shepherd apply journal 42 '- <reason>'`");
    expect(text).not.toContain("Journal key decisions");
    expect(text).not.toContain("$HEAD_SHA");
    expect(text).toContain("--require-sha HEAD");
    expect(text).toContain("Rerun Shepherd now.");
  });

  it("playbook style leaves journaling optional without update permission", () => {
    const text = call("playbook", false).join("\n");
    expect(text).toContain("Commit and push any changes.");
    expect(text).toContain("`pr-shepherd apply journal 42 '- <reason>'`");
  });

  it("inline style keeps the full text", () => {
    const text = call("inline", true).join("\n");
    expect(text).not.toContain("Triage loop");
    expect(text).toContain("Commit and push any changes.");
    expect(text).toContain("Optional: If you reject a code review suggestion");
  });

  it("omits the advisory for a minimized bot-comment acknowledgement alone", () => {
    const comment = {
      id: "c-1",
      author: "coderabbitai",
      authorType: "Bot",
      body: "regenerated summary",
      isMinimized: true,
      firstLookStatus: "minimized",
      url: "",
      createdAtUnix: 0,
    } as FirstLookComment;
    const instructions = buildFixInstructions(
      [],
      [],
      [],
      [],
      "main",
      resolveCommand,
      false,
      42,
      [],
      [comment],
    );
    expect(instructions.join("\n")).not.toContain("apply journal");
    expect(instructions.join("\n")).toContain("Review every item under `## First-look items`");
  });

  it("omits the advisory for a failing check alone", () => {
    const check = {
      name: "CI",
      category: "failing",
      conclusion: "FAILURE",
      runId: "123",
      detailsUrl: "https://github.com/owner/repo/actions/runs/123",
    } as AgentCheck;
    const instructions = buildFixInstructions(
      [],
      [],
      [check],
      [],
      "main",
      resolveCommand,
      false,
      42,
    );
    expect(instructions.join("\n")).not.toContain("apply journal");
  });
});
