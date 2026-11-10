import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAppEligibleGraphql, isAppEligibleRest } from "./app-eligibility.mts";

describe("REST eligibility", () => {
  it("allows only repository reads", () => {
    expect(isAppEligibleRest("GET", "/repos/o/r/commits/abc/check-runs")).toBe(true);
    expect(isAppEligibleRest("HEAD", "/repos/o/r/pulls/1")).toBe(true);
    expect(isAppEligibleRest("POST", "/repos/o/r/issues/1/comments")).toBe(false);
    expect(isAppEligibleRest("PUT", "/repos/o/r/pulls/1/merge")).toBe(false);
    expect(isAppEligibleRest("GET", "/user")).toBe(false);
    expect(isAppEligibleRest("GET", "/user/repos")).toBe(false);
    expect(isAppEligibleRest("GET", "/notifications")).toBe(false);
    expect(isAppEligibleRest("GET", "/rate_limit")).toBe(false);
  });
});

describe("GraphQL eligibility", () => {
  it("allows queries that select no viewer field, with comments and fragments", () => {
    expect(isAppEligibleGraphql("query { repository { id } }")).toBe(true);
    expect(isAppEligibleGraphql("# viewer in a comment\n{ repository { id } }")).toBe(true);
    expect(isAppEligibleGraphql("fragment F on Repository { id }\nquery Q { ...F }")).toBe(true);
    expect(isAppEligibleGraphql("query { repository { reviewRequests { id } } }")).toBe(true);
  });

  it("keeps mutations and viewer-relative documents on the user", () => {
    expect(isAppEligibleGraphql("# c\nmutation M { x }")).toBe(false);
    expect(isAppEligibleGraphql("query { viewer { login } }")).toBe(false);
    expect(isAppEligibleGraphql("query { node { viewerCanReact viewerDidAuthor } }")).toBe(false);
    expect(isAppEligibleGraphql("query { x { isReadByViewer } }")).toBe(false);
    expect(isAppEligibleGraphql("fragment F on T { viewerPermission }\nquery { ...F }")).toBe(
      false,
    );
  });

  it("caches the verdict per document", () => {
    const document = "query Cached { repository { id } }";
    expect(isAppEligibleGraphql(document)).toBe(isAppEligibleGraphql(document));
  });

  it("pins which bundled .gql documents the app may answer", () => {
    const directory = new URL("./gql/", import.meta.url);
    const eligible = readdirSync(directory)
      .filter((name) => name.endsWith(".gql"))
      .filter((name) => isAppEligibleGraphql(readFileSync(new URL(name, directory), "utf8")))
      .sort();
    // Adding a viewer field to one of these moves it to the user's token; update this list on purpose.
    expect(eligible).toMatchInlineSnapshot(`
      [
        "base-behind.gql",
        "check-run-annotations-batch.gql",
        "check-run-annotations.gql",
        "commit-check-contexts.gql",
        "commit-check-suites.gql",
        "get-pr-body.gql",
        "get-pr-head-sha.gql",
        "merged-base-pull-requests.gql",
        "poll-summary-annotation-probe.gql",
        "poll-summary-check-contexts.gql",
        "poll-summary-check-page.gql",
        "pr-merge-policy.gql",
        "pr-number-by-branch.gql",
        "ref-rules-query.gql",
        "ref-rules.gql",
        "reply-thread-comments.gql",
        "reply-thread-transcripts.gql",
        "stack-handoff-check-runs.gql",
        "upper-layer-conflict-target.gql",
      ]
    `);
  });
});
