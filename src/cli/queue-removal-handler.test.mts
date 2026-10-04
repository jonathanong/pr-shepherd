import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT } from "../exit-codes.mts";
import type { BatchPrData } from "../types.mts";

const { mockFetchPrBatch, mockGetRepoInfo, mockGetCurrentPrNumber } = vi.hoisted(() => ({
  mockFetchPrBatch: vi.fn(),
  mockGetRepoInfo: vi.fn(),
  mockGetCurrentPrNumber: vi.fn(),
}));
vi.mock("../github/batch.mts", () => ({ fetchPrBatch: mockFetchPrBatch }));
vi.mock("../github/client.mts", () => ({
  getRepoInfo: mockGetRepoInfo,
  getCurrentPrNumber: mockGetCurrentPrNumber,
}));

import { main } from "../cli-parser.mts";
import { handleQueueRemoval } from "./queue-removal-handler.mts";
import {
  isCiQueueRemovalReason,
  matchesQueueRemovalAcknowledgment,
  readQueueRemovalAcknowledgment,
} from "../state/queue-removal-ack.mts";

const key = { owner: "acme", repo: "widgets", pr: 42 };
const headSha = "a".repeat(40);
const queueCommitOid = "b".repeat(40);
const removedAtUnix = 1_700_000_000;
let stateDir: string;
let stdout: ReturnType<typeof vi.spyOn>;
let stderr: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "pr-shepherd-queue-removal-cli-"));
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
  process.exitCode = undefined;
  mockGetRepoInfo.mockResolvedValue({ owner: key.owner, name: key.repo });
  mockGetCurrentPrNumber.mockResolvedValue(key.pr);
  mockFetchPrBatch.mockResolvedValue({ data: currentBatch() });
  stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
  stdout.mockRestore();
  stderr.mockRestore();
  vi.clearAllMocks();
});

function out(): string {
  return stdout.mock.calls.map((call: unknown[]) => String(call[0])).join("");
}

function args(): string[] {
  return [
    "42",
    "--require-sha",
    headSha,
    "--queue-commit",
    queueCommitOid,
    "--removed-at",
    String(removedAtUnix),
  ];
}

function currentBatch(overrides: Record<string, unknown> = {}): BatchPrData {
  return {
    number: key.pr,
    state: "OPEN",
    headRefOid: headSha,
    headPushedAtUnix: removedAtUnix - 10,
    stack: { number: 7, size: 2, position: 2, baseRefName: "main" },
    isMergeQueueEnabled: true,
    isInMergeQueue: false,
    autoMergeRequest: null,
    latestMergeQueueRemoval: {
      reason: "CI_FAILURE",
      beforeCommitOid: queueCommitOid,
      beforeCommitParentOids: ["c".repeat(40), headSha],
      createdAtUnix: removedAtUnix,
    },
    ...overrides,
  } as BatchPrData;
}

describe("apply queue-removal", () => {
  it("records acknowledgment only for the exact current CI queue-removal tuple", async () => {
    await handleQueueRemoval(args());
    const acknowledgment = await readQueueRemovalAcknowledgment(key);
    expect(acknowledgment).toEqual({
      headSha,
      queueCommitOid,
      removedAtUnix,
    });
    expect(
      matchesQueueRemovalAcknowledgment(acknowledgment, {
        headSha,
        queueCommitOid,
        removedAtUnix,
      }),
    ).toBe(true);
    expect(out()).toContain(`queueCommitOid: ${queueCommitOid}`);
    expect(mockFetchPrBatch).toHaveBeenCalledWith(42, { owner: "acme", name: "widgets" });
    expect(process.exitCode).toBeUndefined();
  });

  it.each([
    ["changed head", { headRefOid: "d".repeat(40) }],
    [
      "changed queue commit",
      {
        latestMergeQueueRemoval: {
          ...currentBatch().latestMergeQueueRemoval,
          beforeCommitOid: "e".repeat(40),
        },
      },
    ],
    [
      "changed removal time",
      {
        latestMergeQueueRemoval: {
          ...currentBatch().latestMergeQueueRemoval,
          createdAtUnix: removedAtUnix + 1,
        },
      },
    ],
    [
      "manual removal",
      { latestMergeQueueRemoval: { ...currentBatch().latestMergeQueueRemoval, reason: "MANUAL" } },
    ],
    [
      "unknown removal",
      { latestMergeQueueRemoval: { ...currentBatch().latestMergeQueueRemoval, reason: null } },
    ],
    ["active queue entry", { isInMergeQueue: true }],
    ["non-stack PR", { stack: undefined }],
    ["disabled merge queue", { isMergeQueueEnabled: false }],
    [
      "head updated after removal",
      {
        headPushedAtUnix: removedAtUnix + 1,
        latestMergeQueueRemoval: {
          ...currentBatch().latestMergeQueueRemoval,
          beforeCommitParentOids: ["c".repeat(40)],
        },
      },
    ],
    [
      "single-parent removal older than head committer time",
      {
        headPushedAtUnix: undefined,
        activity: { latestCommitCommittedAtUnix: removedAtUnix + 1 },
        latestMergeQueueRemoval: {
          ...currentBatch().latestMergeQueueRemoval,
          beforeCommitParentOids: ["c".repeat(40)],
        },
      },
    ],
  ])("rejects %s without writing an acknowledgment", async (_name, overrides) => {
    mockFetchPrBatch.mockResolvedValue({ data: currentBatch(overrides) });
    await handleQueueRemoval(args());
    expect(process.exitCode).toBe(EXIT.UNAVAILABLE);
    expect(await readQueueRemovalAcknowledgment(key)).toBeNull();
    expect(stderr.mock.calls.map((call: unknown[]) => String(call[0])).join("")).toContain(
      "stale or is not a current CI-driven removal",
    );
  });

  it("recognizes only the two CI-driven removal reasons", () => {
    expect(isCiQueueRemovalReason("CI_FAILURE")).toBe(true);
    expect(isCiQueueRemovalReason("MERGE_QUEUE_POLICY_CHECK_FAILURE")).toBe(true);
    expect(isCiQueueRemovalReason("MANUAL")).toBe(false);
    expect(isCiQueueRemovalReason(null)).toBe(false);
  });

  it("prints help before GitHub or repository I/O", async () => {
    await main(["node", "pr-shepherd", "apply", "queue-removal", "--help"]);
    expect(out()).toContain("--queue-commit <commit>");
    expect(mockFetchPrBatch).not.toHaveBeenCalled();
    expect(mockGetRepoInfo).not.toHaveBeenCalled();
    expect(mockGetCurrentPrNumber).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});
