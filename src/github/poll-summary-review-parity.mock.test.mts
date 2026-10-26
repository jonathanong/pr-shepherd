import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSummaryPr } from "./poll-summary-raw.mts";
import type { PrComment, ReviewThread } from "../types.mts";
import {
  buildThreadMutationRouting,
  threadHasAuthorizedMutation,
} from "../commands/iterate/thread-mutation-routing.mts";
import { classifyThreadVisibility } from "../comments/thread-visibility.mts";
import { classifyVisibleComments } from "../comments/visible-comments.mts";
import { hashBody, type SeenMarker } from "../state/seen-comments.mts";
import { threadTranscriptBody } from "../threads/transcript.mts";
import { comment, raw, thread } from "../../test-helpers/github/poll-summary-review-raw.mts";
import { runWithGithubTransport } from "./transport.mts";

const state = vi.hoisted(() => ({ overlay: {} as Record<string, unknown> }));

vi.mock("../classify/loader.mts", () => ({ loadClassifyRules: vi.fn().mockResolvedValue([]) }));
vi.mock("../config/load.mts", async (importOriginal) => {
  const { testConfig: build } = await import("../../test-helpers/config/test-config.mts");
  return {
    ...(await importOriginal<typeof import("../config/load.mts")>()),
    loadConfig: () => build(state.overlay),
  };
});

import { evaluatePollSummaryReview } from "./poll-summary-review.mts";

const configure = (iterate: Record<string, unknown>) => {
  state.overlay = { iterate };
};
beforeEach(() => {
  state.overlay = {};
  vi.stubEnv("CLAUDE_CODE_REMOTE", "false");
});

const evaluate = async (input: RawSummaryPr, seen: Map<string, SeenMarker>, admin = true) =>
  (await runWithGithubTransport("graphql", () => evaluatePollSummaryReview(input, seen, admin)))
    .review;
const seenAs = (id: string, body: string) =>
  new Map<string, SeenMarker>([[id, { seenAt: 1, bodyHash: hashBody(body) }]]);

describe("gap 1: a seen human changes-requested review", () => {
  const review = (login: string, type: string) => ({
    id: "cr",
    state: "CHANGES_REQUESTED",
    body: "please change",
    isMinimized: false,
    author: { login, __typename: type },
  });

  it("counts whether or not it was seen, like the full check", async () => {
    const seen = seenAs("cr", "please change");
    expect((await evaluate(raw({ reviews: [review("alice", "User")] }), seen)).actionable).toBe(1);
    expect(
      (await evaluate(raw({ reviews: [review("alice", "User")] }), new Map())).actionable,
    ).toBe(1);
  });

  it("still lets a seen bot review rest once it cannot be dismissed", async () => {
    const seen = seenAs("cr", "please change");
    const bot = raw({ reviews: [review("helper[bot]", "Bot")] });
    expect((await evaluate(bot, seen, true)).actionable).toBe(1);
    expect((await evaluate(bot, seen, false)).actionable).toBeUndefined();
  });
});

describe("gap 2: iterate.resolve-other-human-threads", () => {
  type Author = "bot" | "human" | "viewer";
  const authors: Record<Author, Record<string, unknown>> = {
    bot: { login: "noise-bot", __typename: "Bot" },
    human: { login: "alice", __typename: "User" },
    viewer: { login: "me", __typename: "User", viewerDidAuthor: true },
  };

  function build(
    author: Author,
    flags: { isOutdated: boolean; minimized: boolean },
    canReply: boolean,
  ) {
    const rawThread = thread("t1", "finding", {
      isOutdated: flags.isOutdated,
      viewerCanReply: canReply,
    });
    const root = (rawThread.comments as { nodes: Array<Record<string, unknown>> }).nodes[0]!;
    Object.assign(root, { author: authors[author], isMinimized: flags.minimized });
    if (author === "viewer") root.viewerDidAuthor = true;
    const full: ReviewThread = {
      id: "t1",
      isResolved: false,
      isOutdated: flags.isOutdated,
      isMinimized: flags.minimized,
      viewerCanReply: canReply,
      viewerCanResolve: true,
      path: "src/a.mts",
      line: 3,
      startLine: null,
      author: authors[author]!.login as string,
      authorType: authors[author]!.__typename as "Bot" | "User",
      ...(author === "viewer" && { viewerDidAuthor: true as const }),
      body: "finding",
      url: "",
      comments: [],
    };
    return { rawThread, full };
  }

  it.each(
    (["bot", "human", "viewer"] as Author[]).flatMap((author) =>
      (["none", "outdated", "always"] as const).flatMap((policy) =>
        [
          { isOutdated: false, minimized: false },
          { isOutdated: true, minimized: false },
          { isOutdated: false, minimized: true },
        ].flatMap((flags) =>
          [true, false].map((canReply) => ({ author, policy, flags, canReply })),
        ),
      ),
    ),
  )("matches the full check for $author at $policy ($flags, reply $canReply)", async (c) => {
    configure({ "resolve-other-human-threads": c.policy });
    const { rawThread, full } = build(c.author, c.flags, c.canReply);
    const seen = seenAs("t1", threadTranscriptBody(full));
    const bots = new Set<string>();
    const routing = buildThreadMutationRouting([full], bots, [], c.policy);
    const reply = new Set(routing.replyThreadIds);
    const resolve = new Set(routing.resolveThreadIds);
    const repeatable = new Set(threadHasAuthorizedMutation(full, reply, resolve) ? [full.id] : []);
    const visibility = classifyThreadVisibility([full], seen, bots, repeatable, c.policy);
    const expected = visibility.activeThreads.length + visibility.resolutionOnlyThreads.length;
    const review = await evaluate(raw({ threads: [rawThread] }), seen);
    expect(review.actionable ?? 0).toBe(expected);
  });
});

describe("gap 3: iterate.minimize-comments and iterate.minimize-approvals", () => {
  const prComment = (c: Record<string, unknown>): PrComment => ({
    id: c.id as string,
    isMinimized: false,
    viewerCanMinimize: c.viewerCanMinimize as boolean,
    author: (c.author as { login: string }).login,
    authorType: (c.author as { __typename: "Bot" | "User" }).__typename,
    body: c.body as string,
    url: "",
    createdAtUnix: 0,
  });

  it.each([
    { policy: "bots", author: "bot", canMinimize: true, work: 1 },
    { policy: "all", author: "bot", canMinimize: true, work: 1 },
    { policy: "none", author: "bot", canMinimize: true, work: 0 },
    { policy: "bots", author: "bot", canMinimize: false, work: 0 },
    { policy: "all", author: "human", canMinimize: true, work: 0 },
  ] as const)(
    "counts a seen comment like the full check ($policy, $author, minimize $canMinimize)",
    async ({ policy, author, canMinimize, work }) => {
      configure({ "minimize-comments": policy });
      const item = comment("c1", "noise", {
        viewerCanMinimize: canMinimize,
        author:
          author === "bot"
            ? { login: "noise-bot", __typename: "Bot" }
            : { login: "alice", __typename: "User" },
      });
      const seen = seenAs("c1", "noise");
      const full = classifyVisibleComments([prComment(item)], seen, policy);
      expect(full.actionable).toHaveLength(work);
      expect((await evaluate(raw({ comments: [item] }), seen)).actionable ?? 0).toBe(work);
    },
  );

  const approval = (extra: Record<string, unknown> = {}) => ({
    id: "ap",
    state: "APPROVED",
    body: "",
    isMinimized: false,
    author: { login: "alice", __typename: "User" },
    ...extra,
  });

  it("counts an unseen approval only when minimize-approvals is on", async () => {
    const input = raw({ reviews: [approval()] });
    expect((await evaluate(input, new Map())).actionable).toBeUndefined();
    configure({ "minimize-approvals": true });
    expect((await evaluate(input, new Map())).actionable).toBe(1);
  });

  it("ignores a seen or minimized approval", async () => {
    configure({ "minimize-approvals": true });
    expect(
      (await evaluate(raw({ reviews: [approval()] }), seenAs("ap", ""))).actionable,
    ).toBeUndefined();
    const minimized = raw({ reviews: [approval({ isMinimized: true })] });
    expect((await evaluate(minimized, new Map())).actionable).toBeUndefined();
  });
});
