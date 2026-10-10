import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT, ShepherdError } from "../exit-codes.mts";

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

import { applyQueueRemovalAck } from "./apply-queue-removal.mts";
import { githubOperation, runWithGithubTransport } from "../github/transport.mts";
import { GitHubRequestError } from "../github/errors.mts";

const headSha = "a".repeat(40);
const queueCommitOid = "b".repeat(40);
const removedAtUnix = 1_700_000_000;
let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "pr-shepherd-queue-removal-command-"));
  process.env["PR_SHEPHERD_STATE_DIR"] = tempDir;
  vi.clearAllMocks();
  mockGetRepoInfo.mockResolvedValue({ owner: "acme", name: "widgets" });
  mockGetCurrentPrNumber.mockResolvedValue(42);
  mockFetchPrBatch.mockResolvedValue({
    data: {
      number: 42,
      state: "OPEN",
      headRefOid: headSha,
      headPushedAtUnix: removedAtUnix - 10,
      stack: { number: 7, size: 2, position: 2, baseRefName: "main" },
      isMergeQueueEnabled: true,
      isInMergeQueue: false,
      latestMergeQueueRemoval: {
        reason: "failed_checks",
        beforeCommitOid: queueCommitOid,
        beforeCommitParentOids: ["c".repeat(40), headSha],
        createdAtUnix: removedAtUnix,
      },
    },
  });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(tempDir, { recursive: true, force: true });
});

describe("applyQueueRemovalAck persistence failures", () => {
  it.each(["fallback-during-fetch", "rest-snapshot"])(
    "reports unsupported removal validation after %s without storing acknowledgment",
    async (state) => {
      vi.stubEnv("CLAUDE_CODE_REMOTE", "");
      vi.stubEnv("PR_SHEPHERD_LOG_DISABLED", "1");
      if (state === "fallback-during-fetch")
        mockFetchPrBatch.mockImplementationOnce(() =>
          githubOperation(
            "queue removal read",
            async () => {
              throw new GitHubRequestError("GraphQL refused", {
                status: 403,
                responseMessage: "GitHub GraphQL is not available from Claude Code sessions",
              });
            },
            async () => ({ data: {} }),
          ),
        );
      else mockFetchPrBatch.mockResolvedValueOnce({ data: { transport: "rest" } });
      await expect(
        runWithGithubTransport(state === "rest-snapshot" ? "graphql" : "auto", () =>
          applyQueueRemovalAck({ headSha, queueCommitOid, removedAtUnix }),
        ),
      ).rejects.toMatchObject({
        exitCode: EXIT.UNAVAILABLE,
        message: expect.stringContaining("transport-unsupported"),
      });
      expect(mockFetchPrBatch).toHaveBeenCalledOnce();
      expect(await readdir(tempDir)).toEqual([]);
    },
  );

  it("reports unsupported REST removal validation before repository, PR, or GitHub I/O", async () => {
    await expect(
      runWithGithubTransport("rest", () =>
        applyQueueRemovalAck({ headSha, queueCommitOid, removedAtUnix }),
      ),
    ).rejects.toMatchObject({
      exitCode: EXIT.UNAVAILABLE,
      message: expect.stringContaining("transport-unsupported"),
    });
    expect(mockGetRepoInfo).not.toHaveBeenCalled();
    expect(mockGetCurrentPrNumber).not.toHaveBeenCalled();
    expect(mockFetchPrBatch).not.toHaveBeenCalled();
  });

  it("reports a failed marker write and preserves the state-path obstruction", async () => {
    const obstruction = join(tempDir, "not-a-directory");
    await writeFile(obstruction, "leave this file alone", "utf8");
    process.env["PR_SHEPHERD_STATE_DIR"] = obstruction;

    await expect(
      applyQueueRemovalAck({
        prNumber: 42,
        targetRepository: { owner: "acme", name: "widgets" },
        headSha,
        queueCommitOid,
        removedAtUnix,
      }),
    ).rejects.toMatchObject({
      name: "ShepherdError",
      exitCode: EXIT.UNAVAILABLE,
      message: "Could not write queue-removal acknowledgment state.",
    } satisfies Partial<ShepherdError>);
    expect(await readFile(obstruction, "utf8")).toBe("leave this file alone");
    expect(mockFetchPrBatch).toHaveBeenCalledOnce();
  });

  it("returns unavailable before fetching when the current branch has no PR", async () => {
    mockGetCurrentPrNumber.mockResolvedValue(null);

    await expect(
      applyQueueRemovalAck({
        targetRepository: { owner: "acme", name: "widgets" },
        headSha,
        queueCommitOid,
        removedAtUnix,
      }),
    ).rejects.toMatchObject({
      name: "ShepherdError",
      exitCode: EXIT.UNAVAILABLE,
      message: "No open PR found for current branch. Pass a PR number explicitly.",
    });
    expect(mockFetchPrBatch).not.toHaveBeenCalled();
  });
});
