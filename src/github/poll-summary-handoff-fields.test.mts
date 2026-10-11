import { describe, expect, it } from "vitest";
import { stackModel, summaryLayer } from "../../test-helpers/github/stack-handoff.test-support.mts";
import { withoutHandoffFields } from "./poll-summary-handoff-fields.mts";
import { fingerprintRawSummaryPr } from "./poll-summary-fingerprint.mts";
import type { RawSummaryPr } from "./poll-summary-raw.mts";

type Loose = Record<string, any>;

function layer(): Loose {
  const model = stackModel();
  return structuredClone(summaryLayer(model[0]!, model)) as Loose;
}

/** The same layer without the fields only the handoff reads. */
function legacy(): Loose {
  const pr = layer();
  for (const node of pr.reviewRequests.nodes) delete node.requestedReviewer?.name;
  for (const node of pr.comments.nodes) {
    for (const key of ["viewerCanMinimize", "createdAt", "updatedAt"]) delete node[key];
  }
  for (const node of pr.reviews.nodes) {
    for (const key of ["viewerCanMinimize", "createdAt", "updatedAt", "url", "commit"]) {
      delete node[key];
    }
  }
  for (const thread of pr.reviewThreads.nodes) {
    for (const key of ["viewerCanReply", "viewerCanResolve", "line", "startLine"]) {
      delete thread[key];
    }
    for (const node of thread.comments.nodes) {
      for (const key of [
        "pullRequestReview",
        "path",
        "line",
        "startLine",
        "createdAt",
        "updatedAt",
      ]) {
        delete node[key];
      }
    }
  }
  delete pr.commits.totalCount;
  const rollup = pr.commits.nodes[0].commit.statusCheckRollup;
  delete rollup.state;
  for (const node of rollup.contexts.nodes) {
    if (node.__typename === "StatusContext") {
      for (const key of ["createdAt", "targetUrl", "description"]) delete node[key];
    } else {
      delete node.checkSuite.updatedAt;
      delete node.checkSuite.workflowRun.updatedAt;
    }
  }
  return pr;
}

const fingerprint = (pr: Loose) => fingerprintRawSummaryPr(pr as RawSummaryPr);

describe("withoutHandoffFields", () => {
  it("leaves the handoff-only fields out of READY-receipt fingerprints", () => {
    expect(fingerprint(layer())).toBe(fingerprint(legacy()));
    expect(withoutHandoffFields(layer() as RawSummaryPr)).toEqual(legacy());
  });

  it("ignores an edited hidden comment's timestamps", () => {
    const edited = layer();
    edited.comments.nodes[0].updatedAt = "2026-10-10T00:00:00Z";
    edited.reviewThreads.nodes[0].comments.nodes[0].updatedAt = "2026-10-10T00:00:00Z";
    expect(fingerprint(edited)).toBe(fingerprint(layer()));
  });

  it("hides minimized thread comment bodies and hashes visible ones", () => {
    const hidden = (body: string) => {
      const pr = layer();
      pr.reviewThreads.nodes[0].comments.nodes[0].isMinimized = true;
      pr.reviewThreads.nodes[0].comments.nodes[0].body = body;
      return pr;
    };
    expect(fingerprint(hidden("edited"))).toBe(fingerprint(hidden("original")));
    const visible = layer();
    visible.reviewThreads.nodes[0].comments.nodes[0].body = "edited";
    expect(fingerprint(visible)).not.toBe(fingerprint(layer()));
  });

  it("tolerates absent rollups, suites, and review requests", () => {
    const pr = layer();
    delete pr.reviewRequests;
    pr.commits.nodes[0].commit.statusCheckRollup.contexts.nodes = [
      { __typename: "CheckRun", checkSuite: null },
      { __typename: "CheckRun", checkSuite: { workflowRun: null } },
    ];
    const stripped = withoutHandoffFields(pr as RawSummaryPr) as Loose;
    expect(stripped.reviewRequests).toBeUndefined();
    expect(stripped.commits.nodes[0].commit.statusCheckRollup.contexts.nodes).toEqual([
      { __typename: "CheckRun", checkSuite: null },
      { __typename: "CheckRun", checkSuite: { workflowRun: null } },
    ]);
    pr.commits.nodes[0].commit.statusCheckRollup = null;
    const noRollup = withoutHandoffFields(pr as RawSummaryPr) as Loose;
    expect(noRollup.commits.nodes[0].commit.statusCheckRollup).toBeNull();
  });

  it("leaves REST summaries alone", () => {
    const rest = { ...layer(), transport: "rest" } as unknown as RawSummaryPr;
    expect(withoutHandoffFields(rest)).toBe(rest);
  });
});
