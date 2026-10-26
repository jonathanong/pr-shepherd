import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client.mts", () => ({ graphqlWithRateLimit: vi.fn() }));
vi.mock("./stack-size-hint.mts", () => ({
  loadStackSizeHint: vi.fn(async () => 0),
  storeStackSizeHint: vi.fn(async () => {}),
}));
vi.mock("./poll-summary-check-hydration.mts", () => ({ hydratePollSummaryChecks: vi.fn() }));
vi.mock("../state/seen-comments.mts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../state/seen-comments.mts")>();
  return { ...actual, loadSeenMap: vi.fn() };
});

import { graphqlWithRateLimit } from "./client.mts";
import { hydratePollSummaryChecks } from "./poll-summary-check-hydration.mts";
import { fetchPollSummary } from "./poll-summary.mts";
import { explicit, rawPr, sha } from "../../test-helpers/github/poll-summary-row-raw.mts";
import { loadSeenMap } from "../state/seen-comments.mts";

const mockGraphql = vi.mocked(graphqlWithRateLimit);
const mockHydrate = vi.mocked(hydratePollSummaryChecks);
const mockSeen = vi.mocked(loadSeenMap);
const repo = { owner: "acme", name: "widgets" };
/** The summary read of `failing` rejects with `error`; every other PR reads normally. */
function failSummaryOf(failing: number[], error: unknown) {
  mockSeen.mockImplementation(async ({ pr }) => {
    if (failing.includes(pr)) throw error;
    return new Map();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHydrate.mockResolvedValue(undefined);
  mockSeen.mockResolvedValue(new Map());
});

describe("explicit selections isolate a failed PR read", () => {
  it("turns a failed summary read into a triage row with its error and one-PR command", async () => {
    mockGraphql.mockResolvedValue(explicit([42, 43, 44]));
    failSummaryOf([43], new Error("pagination exploded\nsecond line"));

    const result = await fetchPollSummary({ prNumbers: [42, 43, 44] }, repo);

    expect(result.prs.map(({ pr, action }) => ({ pr, action }))).toEqual([
      { pr: 42, action: "cancel" },
      { pr: 43, action: "triage" },
      { pr: 44, action: "cancel" },
    ]);
    expect(result.prs[1]).toMatchObject({
      reasons: ["summary-read-failed"],
      error: "pagination exploded\nsecond line",
      state: "OPEN",
      headRefOid: sha(43),
      url: "https://github.com/acme/widgets/pull/43",
      pollCommand: "pr-shepherd https://github.com/acme/widgets/pull/43 --until-terminal",
    });
    expect(result.prs[0]).not.toHaveProperty("error");
  });

  it("keeps a draft flag and stringifies a non-Error rejection", async () => {
    const draft = { ...rawPr(43), isDraft: true, url: "" };
    mockGraphql.mockResolvedValue({
      data: { repository: { viewerCanAdminister: false, pr0: rawPr(42), pr1: draft } },
    });
    failSummaryOf([43], "plain string failure");

    const result = await fetchPollSummary({ prNumbers: [42, 43] }, repo);

    expect(result.prs[1]).toMatchObject({
      isDraft: true,
      error: "plain string failure",
      url: "https://github.com/acme/widgets/pull/43",
    });
  });

  it("turns a failed check hydration into a row without hiding its siblings", async () => {
    mockGraphql.mockResolvedValue(explicit([42, 43]));
    mockHydrate.mockImplementation(async (raw) => {
      if (raw.number === 43) throw new Error("more than 100 check runs");
    });

    const result = await fetchPollSummary({ prNumbers: [42, 43] }, repo);

    expect(result.prs[0]).toMatchObject({ pr: 42, action: "cancel" });
    expect(result.prs[1]).toMatchObject({
      pr: 43,
      action: "triage",
      reasons: ["summary-read-failed"],
      error: "more than 100 check runs",
    });
  });
});
