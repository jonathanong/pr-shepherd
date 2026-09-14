import { describe, expect, it } from "vitest";
import { formatActivityLine } from "./iterate-activity-formatter.mts";
import { makeIterateResult } from "../../fixtures/cli-parser.iterate-fixtures.mts";

describe("formatActivityLine", () => {
  it("omits zero commit and review-round segments when only checks are active", () => {
    const result = {
      ...makeIterateResult("wait"),
      activity: {
        commitCount: 0,
        reviewRoundCount: 0,
        latestCommitCommittedAtUnix: null,
        reviewItemsSinceLatestCommit: [],
      },
      inProgressChecks: [
        { name: "CI / build", status: "IN_PROGRESS" as const, runId: "1", detailsUrl: null },
      ],
    };
    expect(formatActivityLine(result)).toBe("**activity** active: `CI / build`");
  });

  it("keeps non-zero segments ahead of active checks", () => {
    const result = {
      ...makeIterateResult("wait"),
      activity: {
        commitCount: 3,
        reviewRoundCount: 2,
        latestCommitCommittedAtUnix: 1,
        reviewItemsSinceLatestCommit: [
          {
            kind: "review-thread-comment" as const,
            id: "PRRT_1",
            author: "reviewer",
            authorType: "User" as const,
            body: "Please adjust this.",
            createdAtUnix: 1,
          },
        ],
      },
      inProgressChecks: [{ name: "CI", status: "QUEUED" as const, runId: "2", detailsUrl: null }],
    };
    expect(formatActivityLine(result)).toBe(
      "**activity** 3 commits · 2 review rounds · 1 review items since latest commit · active: `CI`",
    );
  });

  it("returns null when every activity count is zero and no checks are active", () => {
    const result = {
      ...makeIterateResult("wait"),
      activity: {
        commitCount: 0,
        reviewRoundCount: 0,
        latestCommitCommittedAtUnix: null,
        reviewItemsSinceLatestCommit: [],
      },
      inProgressChecks: [],
    };
    expect(formatActivityLine(result)).toBeNull();
  });
});
