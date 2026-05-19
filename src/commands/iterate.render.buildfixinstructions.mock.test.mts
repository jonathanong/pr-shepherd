/* eslint-disable max-lines */

import { describe, it, expect } from "vitest";
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
        argv: ["pr-shepherd", "resolve", "42"],
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
        argv: ["pr-shepherd", "resolve", "42"],
        requiresHeadSha: true,
        requiresDismissMessage: true,
        hasMutations: true,
      },
      false,
      42,
      0,
    );

    const text = instructions.join("\n");
    expect(text).toContain(
      "For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes.",
    );
    // Conditional commit/rebase phrasing (agent decides if code edits are needed)
    expect(text).toContain("If you applied code edits: commit them with a descriptive message");
    // resolve substitution uses backtick-quoted $HEAD_SHA with fallback
    expect(text).toContain("substituting `$HEAD_SHA` with the pushed commit SHA");
    // New stop sentinel
    expect(text).toContain(
      "Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.",
    );
    // Old prescriptive git commands gone
    expect(text).not.toContain("Commit changed files:");
    expect(text).not.toContain("Rebase and push:");
  });

  it("resolve substitution always includes fallback for unpushed case", () => {
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
        argv: ["pr-shepherd", "resolve", "42"],
        requiresHeadSha: true,
        requiresDismissMessage: false,
        hasMutations: true,
      },
      false,
      42,
      0,
    );

    const text = instructions.join("\n");
    // Always includes "pushed commit SHA" with unpushed fallback
    expect(text).toContain("substituting `$HEAD_SHA` with the pushed commit SHA");
    expect(text).toContain("$(git rev-parse HEAD)");
  });

  it("conditional commit/rebase instruction present when changes-requested reviews exist", () => {
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
        argv: ["pr-shepherd", "resolve", "42"],
        requiresHeadSha: true,
        requiresDismissMessage: true,
        hasMutations: true,
      },
      false,
      42,
      0,
    );

    const text = instructions.join("\n");
    // New conditional phrasing — no prescriptive git commands
    expect(text).toContain("If you applied code edits: commit them with a descriptive message");
    expect(text).toContain("rebase onto `origin/main` per your repository's conventions");
    expect(text).toContain("substituting `$HEAD_SHA` with the pushed commit SHA");
    // No prescriptive git command lines
    expect(text).not.toContain("git add");
    expect(text).not.toContain("git fetch origin");
    expect(text).not.toContain("git push --force-with-lease");
    // New stop sentinel
    expect(text).toContain(
      "Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.",
    );
  });

  it("agent-facing commit/rebase instruction always conditional regardless of review type", () => {
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
        argv: ["pr-shepherd", "resolve", "42"],
        requiresHeadSha: true,
        requiresDismissMessage: true,
        hasMutations: true,
      },
      false,
      42,
      0,
    );

    const text = instructions.join("\n");
    expect(text).toContain(
      "For each bullet under `## Changes-requested reviews` above: read the review body and apply the requested changes.",
    );
    // Conditional phrasing — agent decides whether code edits are needed
    expect(text).toContain("If you applied code edits: commit them with a descriptive message");
    // No old prescriptive commands
    expect(text).not.toContain("Commit changed files:");
    expect(text).not.toContain("Rebase and push:");
    expect(text).not.toContain("git add");
    expect(text).not.toContain("git push --force-with-lease");
    // New stop sentinel
    expect(text).toContain(
      "Stop this iteration — if you pushed new commits, CI needs time before the next tick; otherwise stop before the next tick.",
    );
  });
});
