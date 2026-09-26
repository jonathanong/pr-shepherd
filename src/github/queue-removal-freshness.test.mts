import { describe, expect, it } from "vitest";
import {
  headPushUnixFromCheckNodes,
  queueRemovalAppliesToHead,
} from "./queue-removal-freshness.mts";

const removedAtUnix = 1_700_000_000;

describe("queueRemovalAppliesToHead", () => {
  it("accepts a merge-commit queue whose parents include the current head", () => {
    expect(
      queueRemovalAppliesToHead({
        parentOids: ["base-sha", "pr-head"],
        headOid: "pr-head",
      }),
    ).toBe(true);
  });

  it("rejects a merge-commit queue after the head moves", () => {
    expect(
      queueRemovalAppliesToHead({
        parentOids: ["base-sha", "pr-head-at-removal"],
        headOid: "new-head",
      }),
    ).toBe(false);
  });

  it("accepts a single-parent squash or rebase commit when the head is unchanged", () => {
    expect(
      queueRemovalAppliesToHead({
        parentOids: ["base-sha"],
        headOid: "pr-head",
        headCommittedAtUnix: removedAtUnix - 60,
        removedAtUnix,
      }),
    ).toBe(true);
  });

  it("rejects a single-parent commit after a later push", () => {
    expect(
      queueRemovalAppliesToHead({
        parentOids: ["base-sha"],
        headOid: "pr-head",
        headCommittedAtUnix: removedAtUnix + 60,
        removedAtUnix,
      }),
    ).toBe(false);
  });

  it("rejects a removal whose queue commit GitHub no longer returns", () => {
    expect(queueRemovalAppliesToHead({ parentOids: undefined, headOid: "pr-head" })).toBe(false);
    expect(queueRemovalAppliesToHead({ parentOids: [], headOid: "pr-head" })).toBe(false);
  });

  it("rejects a single-parent removal pushed after it, even with an earlier committer time", () => {
    expect(
      queueRemovalAppliesToHead({
        parentOids: ["base-sha"],
        headOid: "bbbb",
        headCommittedAtUnix: removedAtUnix - 300,
        headPushedAtUnix: removedAtUnix + 60,
        removedAtUnix,
      }),
    ).toBe(false);
  });

  it("keeps a single-parent removal when the push time is at or before the removal", () => {
    expect(
      queueRemovalAppliesToHead({
        parentOids: ["base-sha"],
        headOid: "pr-head",
        headCommittedAtUnix: removedAtUnix + 60,
        headPushedAtUnix: removedAtUnix,
        removedAtUnix,
      }),
    ).toBe(true);
  });

  it("ignores a missing or zero push time and falls back to committer time", () => {
    expect(
      queueRemovalAppliesToHead({
        parentOids: ["base-sha"],
        headOid: "pr-head",
        headPushedAtUnix: 0,
        headCommittedAtUnix: removedAtUnix + 60,
        removedAtUnix,
      }),
    ).toBe(false);
    expect(
      queueRemovalAppliesToHead({
        parentOids: ["base-sha"],
        headOid: "pr-head",
        headPushedAtUnix: removedAtUnix + 60,
      }),
    ).toBe(true);
  });
});

describe("headPushUnixFromCheckNodes", () => {
  const removedAt = "2026-09-20T10:10:00Z";
  const pushedAt = "2026-09-20T10:11:00Z";

  it("uses the earliest pull_request check-suite time", () => {
    expect(
      headPushUnixFromCheckNodes([
        {
          __typename: "CheckRun",
          checkSuite: {
            createdAt: "2026-09-20T10:12:00Z",
            workflowRun: { event: "pull_request", createdAt: pushedAt },
          },
        },
        {
          __typename: "CheckRun",
          checkSuite: {
            createdAt: pushedAt,
            workflowRun: { event: "pull_request_target", createdAt: "2026-09-20T10:13:00Z" },
          },
        },
        {
          __typename: "CheckRun",
          checkSuite: { workflowRun: { event: "merge_group", createdAt: removedAt } },
        },
        { __typename: "StatusContext" },
        null,
      ]),
    ).toBe(Math.floor(Date.parse(pushedAt) / 1000));
  });

  it("falls back to the workflow-run time and skips times it cannot parse", () => {
    expect(
      headPushUnixFromCheckNodes([
        {
          __typename: "CheckRun",
          checkSuite: { workflowRun: { event: "pull_request" } },
        },
        {
          __typename: "CheckRun",
          checkSuite: { workflowRun: { event: "pull_request", createdAt: "not-a-date" } },
        },
        {
          __typename: "CheckRun",
          checkSuite: {
            createdAt: "",
            workflowRun: { event: "pull_request", createdAt: pushedAt },
          },
        },
      ]),
    ).toBe(Math.floor(Date.parse(pushedAt) / 1000));
    expect(headPushUnixFromCheckNodes(undefined)).toBeUndefined();
    expect(headPushUnixFromCheckNodes([])).toBeUndefined();
  });
});
