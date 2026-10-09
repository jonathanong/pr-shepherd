import { beforeEach, expect, it, vi } from "vitest";

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }));
vi.mock("../config/load.mts", () => ({ loadConfig: mockLoadConfig }));
vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));
vi.mock("../state/seen-comments.mts", () => ({
  loadSeenMap: vi.fn().mockResolvedValue(new Map()),
}));

import { graphqlWithRateLimit } from "./client.mts";
import { fetchPollSummary } from "./poll-summary.mts";
import { REF_RULES_QUERY } from "./queries.mts";

import {
  partialStack,
  summaryPage,
  trunkRef,
} from "../../test-helpers/github/merged-stack-summary.test-support.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadConfig.mockReturnValue({
    cliCommand: ["pr-shepherd"],
    botUsernames: [],
    ignoreChecks: [],
    checks: { ciTriggerEvents: ["pull_request"] },
    actions: { autoMarkReady: true, workWhileQueued: false, neverCancelRuns: [] },
  });
});

it("routes all four remaining layers by trunk checks after two lower layers merge", async () => {
  const nodes = partialStack();
  const page = summaryPage(nodes);
  mockGraphql.mockResolvedValueOnce(page).mockResolvedValueOnce(page);

  const result = await fetchPollSummary(
    { stackPrNumber: 2629 },
    { owner: "acme", name: "widgets" },
  );

  expect(result.prs.slice(0, 2).map((pr) => pr.reasons)).toEqual([["merged"], ["merged"]]);
  expect(
    result.prs.slice(2).map((pr) => ({
      pr: pr.pr,
      action: pr.action,
      reasons: pr.reasons,
      missing: pr.checks?.unreportedRequired,
    })),
  ).toEqual(
    [2547, 2569, 2627, 2629].map((pr) => ({
      pr,
      action: "fix_code",
      reasons: ["unreported-required-checks"],
      missing: ["tests", "build"],
    })),
  );
  expect(mockGraphql).toHaveBeenCalledTimes(2);
});

it.each(["unavailable", "absent"])(
  "fetches trunk rules when trunk-based members are %s",
  async (availability) => {
    const nodes = partialStack();
    const selected = availability === "absent" ? nodes.slice(2) : nodes;
    if (availability === "unavailable") {
      for (const node of selected) node.pullRequest.baseRef = null;
    }
    const page = summaryPage(selected);
    mockGraphql
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce({
        data: { repository: { ref: { ...trunkRef, compare: { behindBy: 0 } } } },
      });

    const result = await fetchPollSummary(
      { stackPrNumber: 2629 },
      { owner: "acme", name: "widgets" },
    );

    expect(mockGraphql).toHaveBeenLastCalledWith(REF_RULES_QUERY, {
      owner: "acme",
      repo: "widgets",
      qualifiedName: "refs/heads/main",
      headRef: String(2547).padStart(40, "0"),
    });
    expect(
      result.prs.filter((pr) => pr.state === "OPEN").map((pr) => pr.checks?.unreportedRequired),
    ).toEqual(Array.from({ length: 4 }, () => ["tests", "build"]));
  },
);

it("does not fetch trunk rules for a fully terminal stack", async () => {
  const nodes = partialStack();
  for (const node of nodes) {
    node.pullRequest.state = node.position % 2 === 0 ? "CLOSED" : "MERGED";
    node.pullRequest.baseRef = null;
  }
  const page = summaryPage(nodes);
  mockGraphql.mockResolvedValueOnce(page).mockResolvedValueOnce(page);

  const result = await fetchPollSummary(
    { stackPrNumber: 2629 },
    { owner: "acme", name: "widgets" },
  );

  expect(result.prs.every((pr) => pr.action === "cancel")).toBe(true);
  expect(mockGraphql).toHaveBeenCalledTimes(2);
});

it("uses a known trunk ref with no required checks without a fallback fetch", async () => {
  const nodes = partialStack();
  for (const node of nodes.slice(0, 2)) {
    node.pullRequest.baseRef = { branchProtectionRule: null, rules: { nodes: [] } };
  }
  const page = summaryPage(nodes);
  mockGraphql.mockResolvedValueOnce(page).mockResolvedValueOnce(page);

  const result = await fetchPollSummary(
    { stackPrNumber: 2629 },
    { owner: "acme", name: "widgets" },
  );

  expect(result.prs.slice(2).map((pr) => pr.checks?.unreportedRequired)).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  expect(mockGraphql).toHaveBeenCalledTimes(2);
});
