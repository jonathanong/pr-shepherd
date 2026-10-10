import { describe, expect, it, vi } from "vitest";
import { wire, serve, comment, repo } from "../../test-helpers/github/rest-read.test-support.mts";
import { serveRestSnapshot } from "../../test-helpers/github/rest-snapshot.test-support.mts";
import { readRestFeedback } from "./rest-feedback-read.mts";
import { fetchRestPrBatch } from "./rest-batch-read.mts";
import { EXIT } from "../exit-codes.mts";

const thread = (ids: number[]) => ({
  resolved: false,
  outdated: false,
  path: "src/index.mts",
  line: 5,
  comment_ids: ids,
});

describe("REST feedback snapshot consistency", () => {
  it.each(["reply", "thread"])("recovers a new inline %s posted during the read", async (kind) => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    let inlineReads = 0;
    const added = comment(12, kind === "reply" ? 11 : undefined);
    await serve((request, response) => {
      const path = request.path.split("?")[0];
      const body = path?.endsWith("/ccr/review_threads")
        ? kind === "reply"
          ? [thread([11, 12])]
          : [thread([11]), thread([12])]
        : path?.endsWith("/pulls/101/comments")
          ? ++inlineReads === 1
            ? [comment(11)]
            : [comment(11), added]
          : [];
      response.end(JSON.stringify(body));
    });

    const result = await readRestFeedback(101, repo);
    expect(result.threads.flatMap((item) => item.comments?.map((reply) => reply.id) ?? [])).toEqual(
      ["PRRC_11", "PRRC_12"],
    );
    expect(result.unavailable).toEqual([]);
    expect(
      wire.requests
        .filter((request) => request.path !== "/user")
        .slice(-2)
        .map((request) => request.path.split("?")[0]),
    ).toEqual([
      "/repos/octocat/hello-world/pulls/101/ccr/review_threads",
      "/repos/octocat/hello-world/pulls/101/comments",
    ]);
    expect(inlineReads).toBe(2);
  });

  it("recovers a reply deleted after inline comments were read", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    let inlineReads = 0;
    let threadReads = 0;
    await serve((request, response) => {
      const path = request.path.split("?")[0];
      let body: unknown = [];
      if (path?.endsWith("/ccr/review_threads")) {
        threadReads++;
        body = [thread([11])];
      } else if (path?.endsWith("/pulls/101/comments"))
        body = ++inlineReads === 1 ? [comment(11), comment(12, 11)] : [comment(11)];
      response.end(JSON.stringify(body));
    });

    const result = await readRestFeedback(101, repo);
    expect(result.threads[0]?.comments?.map((reply) => reply.id)).toEqual(["PRRC_11"]);
    expect({ inlineReads, threadReads }).toEqual({ inlineReads: 2, threadReads: 2 });
  });

  it.each(["missing inline", "missing CCR", "different IDs"])(
    "bounds persistent %s membership changes and fails temporarily",
    async (kind) => {
      vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
      await serveRestSnapshot({
        inline: kind === "missing CCR" ? [comment(11), comment(12, 11)] : [comment(11)],
        threads: [
          thread(kind === "missing inline" ? [11, 12] : kind === "different IDs" ? [12] : [11]),
        ],
      });

      await expect(readRestFeedback(101, repo)).rejects.toMatchObject({
        status: 409,
        exitCode: EXIT.TEMPFAIL,
        message: expect.stringContaining("changed while REST snapshot was being read"),
      });
      expect(wire.requests.filter((request) => request.path.includes("/ccr/")).length).toBe(2);
      expect(
        wire.requests.filter((request) => request.path.includes("/pulls/101/comments")).length,
      ).toBe(2);
    },
  );

  it.each([
    { name: "duplicate inline IDs", inline: [comment(11), comment(11)], threads: [thread([11])] },
    { name: "duplicate CCR IDs", inline: [comment(11)], threads: [thread([11, 11])] },
    {
      name: "overlapping CCR threads",
      inline: [comment(11)],
      threads: [thread([11]), thread([11])],
    },
    {
      name: "invalid inline ID",
      inline: [{ ...comment(11), id: "invalid" }],
      threads: [thread([11])],
    },
    { name: "empty CCR thread", inline: [comment(11)], threads: [thread([])] },
    {
      name: "invalid CCR status",
      inline: [comment(11)],
      threads: [{ ...thread([11]), resolved: "invalid" }],
    },
    { name: "reply as CCR root", inline: [comment(12, 11)], threads: [thread([12])] },
  ])("keeps $name fatal without a snapshot retry", async ({ name: _name, ...snapshot }) => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serveRestSnapshot(snapshot);

    await expect(readRestFeedback(101, repo)).rejects.toMatchObject({
      status: 200,
      exitCode: EXIT.SOFTWARE,
    });
    expect(
      wire.requests.filter((request) => request.path.includes("/ccr/")).length,
    ).toBeLessThanOrEqual(1);
  });

  it("validates refreshed inline payloads instead of downgrading malformed data", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    let inlineReads = 0;
    await serve((request, response) => {
      const path = request.path.split("?")[0];
      const body = path?.endsWith("/ccr/review_threads")
        ? [thread([11, 12])]
        : path?.endsWith("/pulls/101/comments")
          ? ++inlineReads === 1
            ? [comment(11)]
            : [comment(11), { ...comment(12, 11), body: 42 }]
          : [];
      response.end(JSON.stringify(body));
    });
    await expect(readRestFeedback(101, repo)).rejects.toMatchObject({
      status: 200,
      exitCode: EXIT.SOFTWARE,
      message: expect.stringContaining("feedback body"),
    });
    expect(inlineReads).toBe(2);
  });

  it("preserves issue comments and review bodies in a complete CCR-backed snapshot", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serveRestSnapshot({
      inline: [comment(11)],
      comments: [comment(20)],
      threads: [thread([11])],
      reviews: [
        {
          ...comment(9),
          node_id: "PRR_9",
          state: "CHANGES_REQUESTED",
          commit_id: "aaa111",
          submitted_at: comment(9).created_at,
        },
      ],
    });
    const result = await fetchRestPrBatch(101, repo);
    expect(result.data.comments).toMatchObject([{ id: "PRRC_20", body: "feedback 20" }]);
    expect(result.data.changesRequestedReviews).toMatchObject([
      {
        id: "PRR_9",
        body: "feedback 9",
        commitOid: "aaa111",
        createdAtUnix: Date.parse(comment(9).created_at) / 1000,
      },
    ]);
  });
});
