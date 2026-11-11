import { describe, expect, it } from "vitest";
import { parseEnvelope, parseEnvelopes } from "./envelope.mts";
import { matchesAny } from "./matcher.mts";
import type { EventEnvelope, WatchTarget } from "./types.mts";

const matchesTarget = (event: EventEnvelope, target: WatchTarget) => matchesAny(event, [target]);
const target: WatchTarget = {
  repo: "acme/widgets",
  pr: 7,
  headSha: "AbC123",
  headRef: "feature/x",
  baseRef: "main",
};

function event(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    id: "d1",
    event: "check_suite",
    action: "completed",
    repo: "acme/widgets",
    prs: [],
    headSha: null,
    headRef: null,
    baseRef: null,
    ...overrides,
  };
}

describe("matchesTarget", () => {
  it("matches by PR number, case-insensitively on the repo", () => {
    expect(matchesTarget(event({ prs: [3, 7] }), target)).toBe(true);
    expect(matchesTarget(event({ repo: "ACME/Widgets", prs: [7] }), target)).toBe(true);
    expect(matchesTarget(event({ prs: [8] }), target)).toBe(false);
  });

  it("never matches another repository or an owner-level event", () => {
    expect(matchesTarget(event({ repo: "acme/other", prs: [7] }), target)).toBe(false);
    expect(matchesTarget(event({ repo: null, prs: [7] }), target)).toBe(false);
  });

  it("matches the head SHA regardless of case", () => {
    expect(matchesTarget(event({ headSha: "abc123" }), target)).toBe(true);
    expect(matchesTarget(event({ headSha: "zzz" }), target)).toBe(false);
  });

  it("matches the head ref, with or without refs/heads/", () => {
    expect(matchesTarget(event({ headRef: "feature/x" }), target)).toBe(true);
    expect(matchesTarget(event({ headRef: "refs/heads/feature/x" }), target)).toBe(true);
    expect(matchesTarget(event({ headRef: "feature/y" }), target)).toBe(false);
  });

  it("matches a merge-queue ref for this PR and base only", () => {
    const queued = (ref: string) => event({ event: "push", headRef: ref });
    expect(matchesTarget(queued("gh-readonly-queue/main/pr-7-deadbeef"), target)).toBe(true);
    expect(matchesTarget(queued("gh-readonly-queue/main/pr-8-deadbeef"), target)).toBe(false);
    expect(matchesTarget(queued("gh-readonly-queue/dev/pr-7-deadbeef"), target)).toBe(false);
    const noBase: WatchTarget = { repo: "acme/widgets", pr: 7 };
    expect(matchesTarget(queued("gh-readonly-queue/dev/pr-7-deadbeef"), noBase)).toBe(true);
  });

  it("matches a push that moves the base branch, not sibling PRs on that base", () => {
    expect(matchesTarget(event({ event: "push", headRef: "main" }), target)).toBe(true);
    expect(matchesTarget(event({ event: "push", headRef: "dev" }), target)).toBe(false);
    expect(
      matchesTarget(
        event({ event: "pull_request", prs: [8], headRef: "y", baseRef: "main" }),
        target,
      ),
    ).toBe(false);
    expect(matchesTarget(event({ event: "issue_comment", headRef: "main" }), target)).toBe(false);
    expect(
      matchesTarget(event({ event: "push", headRef: "main" }), { repo: "acme/widgets", pr: 7 }),
    ).toBe(false);
  });

  it("matches any of several targets", () => {
    const other: WatchTarget = { repo: "acme/widgets", pr: 9 };
    expect(matchesAny(event({ prs: [9] }), [target, other])).toBe(true);
    expect(matchesAny(event({ prs: [10] }), [target, other])).toBe(false);
    expect(matchesAny(event({ prs: [9] }), [])).toBe(false);
  });
});

describe("parseEnvelope", () => {
  it("keeps the fields pr-shepherd reads and ignores additive ones", () => {
    expect(
      parseEnvelope({
        id: "d",
        event: "push",
        action: 5,
        repo: "a/b",
        prs: [1, "x", 2],
        headSha: "s",
        headRef: "h",
        baseRef: null,
        payload: { secret: true },
        future: 1,
      }),
    ).toEqual({
      id: "d",
      event: "push",
      action: null,
      repo: "a/b",
      prs: [1, 2],
      headSha: "s",
      headRef: "h",
      baseRef: null,
    });
  });

  it("defaults a missing prs list and rejects malformed envelopes", () => {
    expect(parseEnvelope({ id: "d", event: "push" })?.prs).toEqual([]);
    expect(parseEnvelope({ id: 1, event: "push" })).toBeNull();
    expect(parseEnvelope({ id: "d" })).toBeNull();
    expect(parseEnvelope(null)).toBeNull();
    expect(parseEnvelope("x")).toBeNull();
  });

  it("parseEnvelopes skips bad entries and non-arrays", () => {
    expect(parseEnvelopes([{ id: "a", event: "e" }, null])).toHaveLength(1);
    expect(parseEnvelopes("nope")).toEqual([]);
  });
});
