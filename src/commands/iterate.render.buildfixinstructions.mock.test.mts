/* eslint-disable max-lines */

import { describe, it, expect } from "vitest";
import { registerIterateHooks } from "../../test-helpers/commands/iterate-test-support.mts";
import { buildFixInstructions } from "./iterate/render.mts";

registerIterateHooks();

describe("buildFixInstructions", () => {
  it("keeps an otherwise empty fix_code action non-terminal", () => {
    const instructions = buildFixInstructions(
      [],
      [],
      [],
      [],
      "main",
      {
        argv: ["pr-shepherd", "resolve", "42"],
        requiresHeadSha: false,
        requiresDismissMessage: false,
        hasMutations: false,
      },
      false,
      42,
      0,
    );

    expect(instructions).toEqual([
      "`[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.",
    ]);
  });

  it("distinguishes command refusal from source-drift fallback", () => {
    const instructions = buildFixInstructions(
      [
        {
          id: "PRRT_suggestion",
          path: "src/foo.ts",
          line: 2,
          author: "reviewer",
          body: "```suggestion\ntext ```suggestion nested\n```",
          url: "",
          suggestion: {
            startLine: 2,
            endLine: 2,
            lines: ["text ```suggestion nested"],
            author: "reviewer",
          },
        },
      ],
      [],
      [],
      [],
      "main",
      {
        argv: [],
        requiresHeadSha: false,
        requiresDismissMessage: false,
        hasMutations: false,
      },
      false,
      42,
      0,
    );

    const text = instructions.join("\n");
    expect(text).toContain("refuses for any reason");
    expect(text).toContain("nested/unbalanced suggestion fences");
    expect(text).toContain("do not apply the replacement block verbatim");
    expect(text).toContain("source drift prevents a generated suggestion patch from applying");
    expect(text).toContain("replace the heading's exact `path:startLine-endLine` range");
  });

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

    expect(instructions.join("\n")).toContain("edited first-look bullets");
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
      "Read every body under `## Changes-requested reviews` and apply any warranted change.",
    );
    expect(text).toContain("If you changed code, commit any remaining changes and push");
    // CLI no longer prescribes rebase mechanics — that is the caller's convention.
    expect(text).not.toContain("rebase onto");
    expect(text).toContain("Replace `$HEAD_SHA` with the pushed commit SHA");
    expect(instructions.at(-2)).toBe("Run the `apply review:` command shown above.");
    expect(instructions.at(-1)).toBe(
      "`[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll using the same interface and mode: rerun the current `pr-shepherd` CLI invocation with its flags, or call MCP `iterate` again.",
    );
    expect(text).toContain(
      "`[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll",
    );
    expect(text).not.toContain("Stop this iteration");
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
    expect(text).toContain("Replace `$HEAD_SHA` with the pushed commit SHA");
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
    expect(text).toContain("If you changed code, commit any remaining changes and push");
    // CLI no longer prescribes rebase mechanics or names origin/main
    expect(text).not.toContain("rebase onto");
    expect(text).not.toContain("origin/main");
    expect(text).toContain("Replace `$HEAD_SHA` with the pushed commit SHA");
    // No prescriptive git command lines
    expect(text).not.toContain("git add");
    expect(text).not.toContain("git fetch origin");
    expect(text).not.toContain("git push --force-with-lease");
    expect(text).toContain(
      "`[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll",
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
      "Read every body under `## Changes-requested reviews` and apply any warranted change.",
    );
    expect(text).toContain("If you changed code, commit any remaining changes and push");
    // No old prescriptive commands
    expect(text).not.toContain("Commit changed files:");
    expect(text).not.toContain("Rebase and push:");
    expect(text).not.toContain("git add");
    expect(text).not.toContain("git push --force-with-lease");
    expect(text).toContain(
      "`[FIX_CODE]` is non-terminal. After completing these steps, continue with the next poll",
    );
  });

  it("includes annotation-only passing-check guidance without a failing-checks section", () => {
    const instructions = buildFixInstructions(
      [],
      [],
      [
        {
          name: "SonarCloud Code Analysis",
          runId: null,
          detailsUrl: "https://sonarcloud.io",
          conclusion: "SUCCESS",
          annotations: [
            {
              id: "check_annotation_1",
              path: "scripts/instrument-lua.cjs",
              startLine: 30,
              endLine: 30,
              level: "WARNING",
              message: 'Remove this assignment of "i".',
            },
          ],
        },
      ],
      [],
      "main",
      {
        argv: ["pr-shepherd", "resolve", "42"],
        requiresHeadSha: false,
        requiresDismissMessage: false,
        hasMutations: false,
      },
      false,
      42,
      0,
    );

    const text = instructions.join("\n");
    expect(text).toContain("`## Check annotations`");
    expect(text).not.toContain("`## Failing checks`");
    expect(text).toContain("Inspect every referenced range under `## Check annotations`");
    expect(text).not.toContain("For each failing check");
  });

  it("includes annotation sections in failing-check guidance", () => {
    const instructions = buildFixInstructions(
      [],
      [],
      [
        {
          name: "SonarCloud Code Analysis",
          runId: null,
          detailsUrl: "https://sonarcloud.io",
          conclusion: "FAILURE",
          annotations: [
            {
              id: "check_annotation_1",
              path: "src/foo.mts",
              startLine: 1,
              endLine: 1,
              level: "WARNING",
              message: "Fix this.",
            },
          ],
        },
      ],
      [],
      "main",
      {
        argv: ["pr-shepherd", "resolve", "42"],
        requiresHeadSha: false,
        requiresDismissMessage: false,
        hasMutations: false,
      },
      false,
      42,
      0,
    );

    const text = instructions.join("\n");
    expect(text).toContain("`## Failing checks`, `## Check annotations`");
    expect(text).toContain("Inspect every referenced range under `## Check annotations`");
  });

  it("renders the configured behind-base hint when the branch is behind", () => {
    const instructions = buildFixInstructions(
      [],
      [],
      [],
      [],
      "main",
      {
        argv: ["pr-shepherd", "resolve", "42"],
        requiresHeadSha: false,
        requiresDismissMessage: false,
        hasMutations: false,
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
      "rebase --force-with-lease",
      true,
    );

    const text = instructions.join("\n");
    expect(text).toContain(
      "The branch is behind `origin/main`. rebase --force-with-lease before pushing.",
    );
  });

  it("omits the behind-base hint when no hint is configured (default)", () => {
    const instructions = buildFixInstructions(
      [],
      [],
      [],
      [],
      "main",
      {
        argv: ["pr-shepherd", "resolve", "42"],
        requiresHeadSha: false,
        requiresDismissMessage: false,
        hasMutations: false,
      },
      false,
      42,
      0,
    );

    const text = instructions.join("\n");
    expect(text).not.toContain("behind");
  });

  it("omits the behind-base hint when the branch is behind but no hint is configured", () => {
    const instructions = buildFixInstructions(
      [],
      [],
      [],
      [],
      "main",
      {
        argv: ["pr-shepherd", "resolve", "42"],
        requiresHeadSha: false,
        requiresDismissMessage: false,
        hasMutations: false,
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
      "",
      true,
    );

    const text = instructions.join("\n");
    expect(text).not.toContain("behind");
  });

  it("omits the behind-base hint when the branch is not behind, even if configured", () => {
    const instructions = buildFixInstructions(
      [],
      [],
      [],
      [],
      "main",
      {
        argv: ["pr-shepherd", "resolve", "42"],
        requiresHeadSha: false,
        requiresDismissMessage: false,
        hasMutations: false,
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
      "rebase --force-with-lease",
      false,
    );

    const text = instructions.join("\n");
    expect(text).not.toContain("behind");
  });
});
