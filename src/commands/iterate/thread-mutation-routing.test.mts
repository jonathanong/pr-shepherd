import { describe, expect, it } from "vitest";
import { addPrShepherdMarker } from "../../comments/marker.mts";
import { normalizeBotUsernames } from "../../comments/authors.mts";
import type { ReviewThread } from "../../types.mts";
import { buildThreadMutationRouting } from "./thread-mutation-routing.mts";

const BOTS = normalizeBotUsernames(["coderabbitai"]);

function thread(overrides: Partial<ReviewThread> = {}): ReviewThread {
  return {
    id: "t1",
    isResolved: false,
    isOutdated: false,
    isMinimized: false,
    path: "src/foo.mts",
    line: 10,
    startLine: null,
    author: "reviewer",
    authorType: "User",
    body: "please fix",
    url: "",
    createdAtUnix: 1,
    viewerCanReply: true,
    viewerCanResolve: true,
    ...overrides,
  };
}

function marked(base: ReviewThread): ReviewThread {
  return {
    ...base,
    comments: [
      {
        id: "c1",
        isMinimized: false,
        author: base.author,
        authorType: base.authorType,
        body: base.body,
        url: "",
        createdAtUnix: 1,
      },
      {
        id: "c2",
        isMinimized: false,
        author: "shepherd",
        authorType: "User",
        body: addPrShepherdMarker("done"),
        url: "",
        createdAtUnix: 2,
      },
    ],
  };
}

function ids(routing: ReturnType<typeof buildThreadMutationRouting>) {
  return {
    reply: routing.replyThreadIds,
    paired: routing.pairedResolveThreadIds,
    standalone: routing.standaloneResolveThreadIds,
  };
}

describe("buildThreadMutationRouting", () => {
  it("replies and pairs resolve for unmarked bots, including unlocated", () => {
    const bot = thread({
      id: "bot",
      author: "copilot-pull-request-reviewer",
      authorType: "Bot",
      line: null,
      isOutdated: true,
    });
    expect(ids(buildThreadMutationRouting([bot], BOTS, []))).toEqual({
      reply: ["bot"],
      paired: ["bot"],
      standalone: [],
    });
  });

  it("replies and pairs resolve for configured bots and [bot] logins", () => {
    const configured = thread({ id: "cfg", author: "CodeRabbitAI", authorType: "User" });
    const bracket = thread({ id: "br", author: "github-actions[bot]", authorType: "User" });
    const unknown = thread({ id: "unk", author: "mystery", authorType: "Unknown" });
    expect(ids(buildThreadMutationRouting([configured, bracket, unknown], BOTS, []))).toEqual({
      reply: ["cfg", "br", "unk"],
      paired: ["cfg", "br", "unk"],
      standalone: [],
    });
  });

  it("resolves marker-ended bots without another reply", () => {
    const bot = marked(
      thread({ id: "bot", author: "copilot-pull-request-reviewer", authorType: "Bot" }),
    );
    expect(ids(buildThreadMutationRouting([bot], BOTS, []))).toEqual({
      reply: [],
      paired: [],
      standalone: ["bot"],
    });
  });

  it("replies and pairs resolve for unmarked own threads, including outdated unlocated", () => {
    const own = thread({
      id: "own",
      viewerDidAuthor: true,
      isOutdated: true,
      line: null,
    });
    expect(ids(buildThreadMutationRouting([own], BOTS, []))).toEqual({
      reply: ["own"],
      paired: ["own"],
      standalone: [],
    });
  });

  it("resolves marker-ended own threads without another reply", () => {
    const own = marked(thread({ id: "own", viewerDidAuthor: true }));
    expect(ids(buildThreadMutationRouting([own], BOTS, []))).toEqual({
      reply: [],
      paired: [],
      standalone: ["own"],
    });
  });

  it("replies only to other humans at none, including outdated", () => {
    const active = thread({ id: "h1" });
    const outdated = thread({ id: "h2", isOutdated: true, line: null });
    expect(ids(buildThreadMutationRouting([active, outdated], BOTS, [], "none"))).toEqual({
      reply: ["h1", "h2"],
      paired: [],
      standalone: [],
    });
  });

  it("does not resolve unmarked other humans at outdated unless they are outdated", () => {
    const active = thread({ id: "h1" });
    const outdated = thread({ id: "h2", isOutdated: true, line: null });
    expect(ids(buildThreadMutationRouting([active, outdated], BOTS, [], "outdated"))).toEqual({
      reply: ["h1", "h2"],
      paired: ["h2"],
      standalone: [],
    });
  });

  it("pairs reply-and-resolve for other humans at always", () => {
    const active = thread({ id: "h1" });
    const outdated = thread({ id: "h2", isOutdated: true });
    expect(ids(buildThreadMutationRouting([active, outdated], BOTS, [], "always"))).toEqual({
      reply: ["h1", "h2"],
      paired: ["h1", "h2"],
      standalone: [],
    });
  });

  it("does not mutate marker-ended other humans at none", () => {
    const other = marked(thread({ id: "h1" }));
    expect(ids(buildThreadMutationRouting([other], BOTS, [], "none"))).toEqual({
      reply: [],
      paired: [],
      standalone: [],
    });
  });

  it("standalone-resolves marker-ended outdated other humans at outdated", () => {
    const other = marked(thread({ id: "h1", isOutdated: true }));
    expect(ids(buildThreadMutationRouting([other], BOTS, [], "outdated"))).toEqual({
      reply: [],
      paired: [],
      standalone: ["h1"],
    });
  });

  it("standalone-resolves marker-ended other humans at always", () => {
    const other = marked(thread({ id: "h1" }));
    expect(ids(buildThreadMutationRouting([other], BOTS, [], "always"))).toEqual({
      reply: [],
      paired: [],
      standalone: ["h1"],
    });
  });

  it("puts rule-matched other humans in standalone resolve even at none", () => {
    const other = thread({ id: "h1" });
    expect(ids(buildThreadMutationRouting([other], BOTS, ["h1"], "none"))).toEqual({
      reply: ["h1"],
      paired: [],
      standalone: ["h1"],
    });
  });
});
