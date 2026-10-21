import { describe, expect, it } from "vitest";
import { insertEditedCommentsSection, projectEditedComments } from "./edited-comments-format.mts";
import { projectIterateVerbose } from "./iterate-verbose.mts";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";
import type { EditedComment } from "../types.mts";

const minimized: EditedComment = {
  id: "IC_bot",
  isMinimized: true,
  author: "coderabbitai",
  authorType: "Bot",
  body: "Walkthrough updated.",
  url: "https://github.com/o/r/pull/1#issuecomment-1",
  createdAtUnix: 0,
  edited: true,
};

const visible: EditedComment = {
  id: "IC_human",
  isMinimized: false,
  author: "alice",
  authorType: "User",
  body: "Typo fixed.",
  url: "",
  createdAtUnix: 0,
  edited: true,
};

describe("edited comments section", () => {
  it("leaves the text unchanged when there are no edits", () => {
    expect(insertEditedCommentsSection("# PR\n\n## Instructions\n\n1. x", undefined, false)).toBe(
      "# PR\n\n## Instructions\n\n1. x",
    );
    expect(insertEditedCommentsSection("# PR", [], false)).toBe("# PR");
  });

  it("inserts the section before the last Instructions heading", () => {
    const out = insertEditedCommentsSection(
      "# PR\n\n## Instructions\n\n1. x",
      [minimized, visible],
      false,
    );
    expect(out).toBe(
      [
        "# PR",
        "## Edited comments (2) — informational; edits do not block readiness",
        "### [commentId=IC_bot](https://github.com/o/r/pull/1#issuecomment-1) (@coderabbitai · Bot) [status: minimized, edited]",
        "> Walkthrough updated.",
        "### `commentId=IC_human` (@alice) [edited since first look]",
        "> Typo fixed.",
        "## Instructions",
        "1. x",
      ].join("\n\n"),
    );
  });

  it("appends the section when there is no Instructions heading", () => {
    const out = insertEditedCommentsSection("# PR [CANCEL]", [visible], false);
    expect(out.startsWith("# PR [CANCEL]\n\n## Edited comments (1)")).toBe(true);
  });

  it("projects the same fields into JSON, keeping isMinimized only when true", () => {
    expect(projectEditedComments([minimized, visible])).toEqual([
      {
        id: "IC_bot",
        author: "coderabbitai",
        authorType: "Bot",
        body: "Walkthrough updated.",
        url: "https://github.com/o/r/pull/1#issuecomment-1",
        isMinimized: true,
      },
      { id: "IC_human", author: "alice", authorType: "User", body: "Typo fixed.", url: "" },
    ]);
  });

  it("uses the same projection in verbose JSON", () => {
    for (const action of ["triage", "escalate"] as const) {
      const result = { ...makeIterateResult(action), editedComments: [minimized] };
      expect(projectIterateVerbose(result)).toMatchObject({
        editedComments: projectEditedComments([minimized]),
      });
      expect(JSON.stringify(projectIterateVerbose(result))).not.toContain("createdAtUnix");
    }
  });
});
