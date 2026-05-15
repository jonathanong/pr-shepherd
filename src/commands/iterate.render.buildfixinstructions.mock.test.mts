/* eslint-disable max-lines */
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
        requiresHeadSha: true,
        requiresDismissMessage: true,
        hasMutations: true,
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

  it("treats changes-requested reviews as review-only when no threads/checks exist", () => {
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
        requiresHeadSha: true,
        requiresDismissMessage: true,
        hasMutations: true,
      },
      false,
      42,
      0,
    );

    expect(instructions.join("\n")).toContain(
      "For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes.",
    );
    expect(instructions.join("\n")).toContain(
      `Keep the PR title and description current: if the changes alter the PR's scope or intent, run \`gh pr edit 42 --title "<new title>" --body "<new body>"\` to reflect them. Skip if the existing title/body still accurately describe the PR.`,
    );
    expect(instructions.join("\n")).toContain(
      'Run the `resolve:` command shown above, substituting "$HEAD_SHA" with the current HEAD SHA',
    );
    expect(instructions.join("\n")).toContain(
      "Capture the current HEAD SHA before resolving with: `HEAD_SHA=$(git rev-parse HEAD)`.",
    );
    expect(instructions.join("\n")).not.toContain("Commit changed files:");
    expect(instructions.join("\n")).not.toContain("Rebase and push:");
    expect(instructions.join("\n")).toContain("Stop this iteration before the next tick.");
  });

  it("uses pushed commit SHA substitution when review requests require a push", () => {
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
        hasMutations: true,
      },
      false,
      42,
      0,
      [],
      [],
      [],
      [],
      [],
      [],
      undefined,
      true,
    );

    const text = instructions.join("\n");
    expect(text).toContain(
      'Run the `resolve:` command shown above, substituting "$HEAD_SHA" with the pushed commit SHA',
    );
    expect(text).not.toContain('substituting "$HEAD_SHA" with the current HEAD SHA');
  });

  it("uses explicit needsPushInput override to force push-style guidance", () => {
    const instructions = buildFixInstructions(
      [],
      [],
      [],
      [
        {
          id: "r-3",
          author: "reviewer",
          authorType: "Unknown" as const,
          body: "Please fix the failing logic in src/util.ts.",
        },
      ],
      "main",
      {
        argv: ["npx", "pr-shepherd", "resolve", "42"],
        requiresHeadSha: true,
        requiresDismissMessage: true,
        hasMutations: true,
      },
      false,
      42,
      0,
      [],
      [],
      [],
      [],
      [],
      [],
      undefined,
      true,
    );

    const text = instructions.join("\n");
    expect(text).not.toContain("Commit changed files:");
    expect(text).toContain(
      "Rebase and push: `git fetch origin && git rebase origin/main && git push --force-with-lease`",
    );
    expect(text).toContain(
      'Run the `resolve:` command shown above, substituting "$HEAD_SHA" with the pushed commit SHA',
    );
    expect(text).not.toContain("Stop this iteration before the next tick.");
  });

  it("does not emit commit/push guidance when review changes are review-only but needsPush is forced off", () => {
    const instructions = buildFixInstructions(
      [],
      [],
      [],
      [
        {
          id: "r-4",
          author: "reviewer",
          authorType: "Unknown" as const,
          body: "Please adjust wording in the docs only.",
        },
      ],
      "main",
      {
        argv: ["npx", "pr-shepherd", "resolve", "42"],
        requiresHeadSha: true,
        requiresDismissMessage: true,
        hasMutations: true,
      },
      false,
      42,
      0,
      [],
      [],
      [],
      [],
      [],
      [],
      undefined,
      false,
    );

    const text = instructions.join("\n");
    expect(text).toContain(
      "For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes.",
    );
    expect(text).toContain(
      `Keep the PR title and description current: if the changes alter the PR's scope or intent, run \`gh pr edit 42 --title "<new title>" --body "<new body>"\` to reflect them. Skip if the existing title/body still accurately describe the PR.`,
    );
    expect(text).toContain(
      'Run the `resolve:` command shown above, substituting "$HEAD_SHA" with the current HEAD SHA',
    );
    expect(text).toContain(
      "Capture the current HEAD SHA before resolving with: `HEAD_SHA=$(git rev-parse HEAD)`.",
    );
    expect(text).not.toContain("Commit changed files:");
    expect(text).not.toContain("Rebase and push:");
    expect(text).not.toContain("Stop this iteration — CI needs time to run on the new push");
    expect(text).toContain("Stop this iteration before the next tick.");
  });
});
