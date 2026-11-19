import { beforeEach, describe, expect, it, vi } from "vitest";
import { findPendingRunComments } from "./pending-run-comments.mts";
import { hashBody } from "../state/seen-comments.mts";
import type { PrComment } from "../types.mts";

const { readRest } = vi.hoisted(() => ({ readRest: vi.fn() }));
vi.mock("../github/rest-reader-core.mts", () => ({ readRest }));

const repo = { owner: "owner", name: "repo" };
const body =
  "Claude Code is working… [View job run](https://github.com/owner/repo/actions/runs/555)";

function comment(over: Partial<PrComment> = {}): PrComment {
  return {
    id: "IC_1",
    author: "claude",
    authorType: "Bot",
    body,
    url: "https://github.com/owner/repo/pull/1#issuecomment-1",
    createdAtUnix: 100,
    isMinimized: false,
    ...over,
  };
}

const find = (comments: PrComment[], seen = new Map()) =>
  findPendingRunComments(comments, repo, seen, new Set());

describe("findPendingRunComments", () => {
  beforeEach(() => readRest.mockReset());

  it("matches the run link case-insensitively and only for this repository", async () => {
    readRest.mockResolvedValue({ status: "in_progress", event: "issue_comment" });
    const links = [
      "http://GITHUB.com/Owner/Repo/actions/runs/9",
      "https://github.com/other/repo/actions/runs/1",
      "https://github.com/owner/repoX/actions/runs/2",
      "https://github.com/owner/repo/pull/3",
    ];
    const pending = await find(links.map((link, i) => comment({ id: `IC_${i}`, body: link })));
    expect([...pending.keys()]).toEqual(["IC_0"]);
    expect(readRest).toHaveBeenCalledTimes(1);
    expect(readRest).toHaveBeenCalledWith("GET", "/repos/owner/repo/actions/runs/9");
  });

  it("holds a bot comment whose comment-triggered run has not completed", async () => {
    readRest.mockResolvedValue({ status: "in_progress", event: "issue_comment" });
    const pending = await find([comment()]);
    expect(readRest).toHaveBeenCalledWith("GET", "/repos/owner/repo/actions/runs/555");
    expect(pending.get("IC_1")).toEqual({
      id: "IC_1",
      author: "claude",
      url: "https://github.com/owner/repo/pull/1#issuecomment-1",
      runId: "555",
      runStatus: "in_progress",
    });
  });

  it.each(["queued", "waiting", "pending"])("treats a %s run as pending", async (status) => {
    readRest.mockResolvedValue({ status, event: "pull_request_review_comment" });
    expect((await find([comment()])).size).toBe(1);
  });

  it("does not hold a comment once its run completed", async () => {
    readRest.mockResolvedValue({ status: "completed", event: "issue_comment" });
    expect((await find([comment()])).size).toBe(0);
  });

  it("does not hold a bot comment that links the PR's own CI run", async () => {
    readRest.mockResolvedValue({ status: "in_progress", event: "pull_request" });
    expect((await find([comment()])).size).toBe(0);
    readRest.mockResolvedValue({ status: "in_progress" });
    expect((await find([comment()])).size).toBe(0);
  });

  it("never holds a comment when the run cannot be read", async () => {
    readRest.mockRejectedValue(new Error("boom"));
    expect((await find([comment()])).size).toBe(0);
    readRest.mockResolvedValue({ event: "issue_comment" });
    expect((await find([comment()])).size).toBe(0);
  });

  it("never holds a human, minimized, or run-less comment, and makes no request for them", async () => {
    const found = await find([
      comment({ id: "human", author: "alice", authorType: "User" }),
      comment({ id: "min", isMinimized: true }),
      comment({ id: "plain", body: "Looks good" }),
    ]);
    expect(found.size).toBe(0);
    expect(readRest).not.toHaveBeenCalled();
  });

  it("holds a human-typed account that is a configured bot username", async () => {
    readRest.mockResolvedValue({ status: "in_progress", event: "issue_comment" });
    const pending = await findPendingRunComments(
      [comment({ author: "claude-bot", authorType: "User" })],
      repo,
      new Map(),
      new Set(["claude-bot"]),
    );
    expect(pending.size).toBe(1);
  });

  it("skips a comment already seen unchanged but not an edited one", async () => {
    readRest.mockResolvedValue({ status: "in_progress", event: "issue_comment" });
    const seen = new Map([
      ["IC_1", { seenAt: 1, bodyHash: hashBody(body) }],
      ["IC_2", { seenAt: 1, bodyHash: "aaaaaaaaaaaaaaaa" }],
    ]);
    const pending = await find([comment(), comment({ id: "IC_2" })], seen);
    expect([...pending.keys()]).toEqual(["IC_2"]);
  });

  it("reads each run once and caps lookups at the newest five", async () => {
    readRest.mockResolvedValue({ status: "in_progress", event: "issue_comment" });
    const many = Array.from({ length: 7 }, (_, i) =>
      comment({
        id: `IC_${i}`,
        createdAtUnix: i,
        body: `https://github.com/owner/repo/actions/runs/${i < 2 ? 1 : i}`,
      }),
    );
    const pending = await find(many);
    // Newest five are IC_6..IC_2 (runs 6,5,4,3,2): five distinct runs.
    expect(readRest).toHaveBeenCalledTimes(5);
    expect([...pending.keys()].sort()).toEqual(["IC_2", "IC_3", "IC_4", "IC_5", "IC_6"]);
    readRest.mockClear();
    await find([comment({ id: "a" }), comment({ id: "b" })]);
    expect(readRest).toHaveBeenCalledTimes(1);
  });
});
