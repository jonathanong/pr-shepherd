// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerIterateHooks } from "./iterate-test-support.mts";
import { buildFixInstructions } from "./iterate/render.mts";

registerIterateHooks();

describe("buildFixInstructions", () => {
  it("adds edited guidance for edited first-look threads", () => {
    const instructions = buildFixInstructions(
      [],
      [],
      [],
      [],
      "main",
      {
        argv: ["npx", "pr-shepherd", "resolve", "42"],
        requiresHeadSha: false,
        requiresDismissMessage: false,
        hasMutations: false,
      },
      false,
      42,
      0,
      [
        {
          id: "t-edited",
          isResolved: false,
          isOutdated: true,
          isMinimized: false,
          path: "src/a.ts",
          line: 1,
          startLine: null,
          author: "reviewer",
          authorType: "User",
          body: "updated",
          url: "",
          createdAtUnix: 0,
          firstLookStatus: "outdated",
          edited: true,
        },
      ],
    );

    expect(instructions.join("\n")).toContain("were updated by their author");
  });

  it("treats changes-requested reviews as code-resolution work when no threads/checks exist", () => {
    const instructions = buildFixInstructions(
      [],
      [],
      [],
      [
        {
          id: "r-1",
          author: "reviewer",
          authorType: "Unknown" as const,
          body: "Please rework wording in the PR body",
        },
      ],
      "main",
      {
        argv: ["npx", "pr-shepherd", "resolve", "42"],
        requiresHeadSha: false,
        requiresDismissMessage: false,
        hasMutations: false,
      },
      false,
      42,
      0,
    );

    expect(instructions.join("\n")).toContain(
      "For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes.",
    );
    expect(instructions.join("\n")).toContain("Commit changed files: `git add <files> && git commit -m \"<descriptive message>\"`");
    expect(instructions.join("\n")).toContain(
      "Stop this iteration — CI needs time to run on the new push before the next tick.",
    );
    expect(instructions.join("\n")).toContain("Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease`");
  });

  it("uses pushed commit SHA substitution when reviews require resolve with a new push", () => {
    const instructions = buildFixInstructions(
      [],
      [],
      [],
      [
        {
          id: "r-2",
          author: "reviewer",
          authorType: "Unknown" as const,
          body: "Please tweak the PR body one last time.",
        },
      ],
      "main",
      {
        argv: ["npx", "pr-shepherd", "resolve", "42"],
        requiresHeadSha: true,
        requiresDismissMessage: false,
        hasMutations: false,
      },
      false,
      42,
      0,
    );

    const text = instructions.join("\n");
    expect(text).toContain(
      'Run the `resolve:` command shown above, substituting "$HEAD_SHA" with the pushed commit SHA',
    );
    expect(text).toContain("Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease`");
  });
});
