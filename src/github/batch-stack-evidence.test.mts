import { describe, expect, it } from "vitest";
import { stackEvidenceFromRaw } from "./batch-stack-evidence.mts";

const sha = (number: number) => String(number).padStart(40, "0");
const viewer = { viewer: { login: "me" }, repository: { viewerCanAdminister: true } };
const required = (context: string) => ({
  branchProtectionRule: null,
  rules: {
    pageInfo: { hasNextPage: false },
    nodes: [
      { type: "REQUIRED_STATUS_CHECKS", parameters: { requiredStatusChecks: [{ context }] } },
    ],
  },
  target: { oid: sha(9) },
});
const entry = (number: number, position: number) => ({
  position,
  pullRequest: {
    number,
    state: "OPEN",
    headRefName: `feature-${number}`,
    headRefOid: sha(number),
    baseRefName: position === 1 ? "main" : `feature-${number - 1}`,
    baseRefOid: sha(number - 1),
  },
});

function raw(overrides: { number?: number; baseRefName?: string; nodes?: unknown[] } = {}) {
  return {
    number: overrides.number ?? 2,
    baseRefName: overrides.baseRefName ?? "feature-1",
    baseRef: required("parent-check"),
    stack: {
      number: 7,
      size: 2,
      baseRefName: "main",
      entries: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: (overrides.nodes ?? [entry(2, 2), entry(1, 1)]) as never,
      },
      trunkEntry: { nodes: [{ pullRequest: { baseRefName: "main", baseRef: required("ci") } }] },
    },
  };
}

describe("stackEvidenceFromRaw", () => {
  it("orders the embedded topology and reads the trunk's rules from the bottom entry", () => {
    expect(stackEvidenceFromRaw(raw(), viewer)).toEqual({
      topology: {
        stackNumber: 7,
        stackSize: 2,
        viewerLogin: "me",
        viewerCanAdminister: true,
        ordered: [entry(1, 1).pullRequest, entry(2, 2).pullRequest],
      },
      trunk: { refName: "main", contexts: ["ci"], tipOid: sha(9) },
    });
  });

  it("uses a bottom layer's own base as the trunk", () => {
    const evidence = stackEvidenceFromRaw(raw({ number: 1, baseRefName: "main" }), viewer);
    expect(evidence?.trunk).toEqual({
      refName: "main",
      contexts: ["parent-check"],
      tipOid: sha(9),
    });
  });

  it("drops a topology that is missing a member or the anchor", () => {
    expect(stackEvidenceFromRaw(raw({ nodes: [entry(1, 1)] }), viewer)).not.toHaveProperty(
      "topology",
    );
    expect(stackEvidenceFromRaw(raw({ nodes: [entry(1, 1), null] }), viewer)).not.toHaveProperty(
      "topology",
    );
  });

  it("returns nothing for a PR outside a stack or without usable stack selections", () => {
    expect(stackEvidenceFromRaw({ number: 2, baseRefName: "main", stack: null }, viewer)).toBe(
      undefined,
    );
    const bare = {
      number: 2,
      baseRefName: "feature-1",
      baseRef: null,
      stack: { number: 7, size: 2, baseRefName: "main" },
    };
    expect(stackEvidenceFromRaw(bare, {})).toBeUndefined();
  });
});
