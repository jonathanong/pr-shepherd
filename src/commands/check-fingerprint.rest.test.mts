import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../state/rest-snapshot-report.mts", () => ({
  loadRestSnapshotReport: vi.fn(),
}));
vi.mock("../github/client.mts", () => ({ getMergeableState: vi.fn() }));

import { fingerprintInputDigest } from "../state/pr-fingerprint.mts";
import { loadRestSnapshotReport } from "../state/rest-snapshot-report.mts";
import { getMergeableState } from "../github/client.mts";
import { tryReuseRestSnapshotReport } from "./check-fingerprint.mts";
import { testShepherdConfig } from "../../test-helpers/github/fingerprint-fixture.mts";
import type { ShepherdReport } from "../types.mts";

const mockLoad = vi.mocked(loadRestSnapshotReport);
const mockMergeable = vi.mocked(getMergeableState);
const REPO = { owner: "owner", name: "repo" };
const KEY = { owner: "owner", repo: "repo", pr: 42 };
const CONFIG = testShepherdConfig();
const SNAPSHOT = { allNotModified: true, digest: "snap" };

function waitReport(overrides: Partial<ShepherdReport> = {}): ShepherdReport {
  return {
    pr: 42,
    nodeId: "PR_1",
    repo: "owner/repo",
    status: "IN_PROGRESS",
    baseBranch: "main",
    mergeStatus: {
      status: "CLEAN",
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      state: "OPEN",
      isDraft: false,
      reviewDecision: null,
      blockingBotReviewInProgress: false,
    },
    checks: {
      passing: [],
      failing: [],
      inProgress: [],
      skipped: [],
      filtered: [],
      filteredNames: [],
      blockedByFilteredCheck: false,
    },
    threads: {
      actionable: [],
      resolutionOnly: [],
      autoResolved: [],
      autoResolveErrors: [],
      firstLook: [],
    },
    comments: { actionable: [], firstLook: [] },
    changesRequestedReviews: [],
    reviewSummaries: [],
    firstLookSummaries: [],
    editedSummaries: [],
    approvedReviews: [],
    branchProtection: null,
    ...overrides,
  };
}

function stored(report: ShepherdReport, overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    inputDigest: fingerprintInputDigest(CONFIG),
    snapshotDigest: "snap",
    report,
    ...overrides,
  };
}

const reuse = (snapshot: Parameters<typeof tryReuseRestSnapshotReport>[4]) =>
  tryReuseRestSnapshotReport(42, REPO, KEY, CONFIG, snapshot);

describe("tryReuseRestSnapshotReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMergeable.mockResolvedValue({
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
    });
  });

  it("reuses the stored report when every read was 304 and mergeability is unchanged", async () => {
    mockLoad.mockResolvedValue(stored(waitReport()));
    await expect(reuse(SNAPSHOT)).resolves.toMatchObject({
      pr: 42,
      fingerprintReused: true,
    });
    expect(mockMergeable).toHaveBeenCalledWith(42, "owner", "repo");
  });

  it.each([undefined, { allNotModified: false, digest: "snap" }])(
    "does not read state unless the whole snapshot was not modified (%j)",
    async (snapshot) => {
      await expect(reuse(snapshot)).resolves.toBeNull();
      expect(mockLoad).not.toHaveBeenCalled();
    },
  );

  it("declines without a stored report or on a snapshot digest mismatch", async () => {
    mockLoad.mockResolvedValueOnce(null);
    await expect(reuse(SNAPSHOT)).resolves.toBeNull();
    mockLoad.mockResolvedValueOnce(stored(waitReport(), { snapshotDigest: "other" }));
    await expect(reuse(SNAPSHOT)).resolves.toBeNull();
    expect(mockMergeable).not.toHaveBeenCalled();
  });

  it("declines when the config or rule inputs changed", async () => {
    mockLoad.mockResolvedValue(stored(waitReport(), { inputDigest: "stale" }));
    await expect(reuse(SNAPSHOT)).resolves.toBeNull();
  });

  it("declines when the stored report has actionable work or is READY", async () => {
    mockLoad.mockResolvedValue(stored(waitReport({ status: "READY" })));
    await expect(reuse(SNAPSHOT)).resolves.toBeNull();
    expect(mockMergeable).not.toHaveBeenCalled();
  });

  it.each([
    [{ mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", state: "MERGED" }],
    [{ mergeable: "MERGEABLE", mergeStateStatus: "CLEAN", state: "CLOSED" }],
    [{ mergeable: "CONFLICTING", mergeStateStatus: "CLEAN" }],
    [{ mergeable: "MERGEABLE", mergeStateStatus: "BEHIND" }],
  ] as const)("declines when the live pull differs (%j)", async (live) => {
    mockLoad.mockResolvedValue(stored(waitReport()));
    mockMergeable.mockResolvedValue({ ...live });
    await expect(reuse(SNAPSHOT)).resolves.toBeNull();
  });
});
