import { describe, it, expect, vi } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeThread,
  mockFetchPrBatch,
  mockLoadSeenMap,
} from "../../test-helpers/commands/check.test-support.mts";
import { fixture } from "../../test-helpers/standard-rule-variants.mts";
import { addPrShepherdMarker } from "../comments/marker.mts";
import { hashBody } from "../state/seen-comments.mts";
import { threadTranscriptBodies } from "../threads/transcript.mts";
import type { ReviewThreadComment } from "../types.mts";
import { runCheck } from "./check.mts";

const { mockLoadClassifyRules, coderabbitRule } = vi.hoisted(() => ({
  mockLoadClassifyRules: vi.fn(),
  coderabbitRule: { current: null as unknown },
}));

vi.mock("../classify/loader.mts", async () => {
  const { default: coderabbitNotices } =
    await import("../classify/standard/coderabbit-notices.mts");
  const rules = [
    {
      name: "standard:coderabbit-notices",
      file: "pr-shepherd:standard/coderabbit-notices",
      rule: coderabbitNotices,
    },
  ];
  coderabbitRule.current = rules;
  mockLoadClassifyRules.mockResolvedValue(rules);
  return {
    discoverRuleFiles: vi.fn().mockReturnValue([]),
    loadRules: vi.fn().mockResolvedValue([]),
    loadClassifyRules: mockLoadClassifyRules,
  };
});

registerHooks();

const RATE_LIMIT_REPLY = fixture("coderabbit-chat-rate-limit-reply").body;
const ROOT_FINDING = "Avoid mutating the input array in place.";
const SHEPHERD_REPLY = addPrShepherdMarker("Fixed in the latest commit.");

const comment = (
  id: string,
  body: string,
  author: "coderabbitai" | "jonathanong" = "coderabbitai",
  createdAtUnix = 10,
): ReviewThreadComment => ({
  id,
  isMinimized: false,
  author,
  authorType: author === "coderabbitai" ? "Bot" : "User",
  body,
  url: `https://github.com/jongleberry/no-mistakes/pull/4786#discussion_${id}`,
  createdAtUnix,
});

const makeCodeRabbitThread = (id: string, isResolved: boolean, comments: ReviewThreadComment[]) =>
  makeThread({
    id,
    isResolved,
    isOutdated: false,
    author: "coderabbitai",
    authorType: "Bot",
    body: ROOT_FINDING,
    comments,
  });

const shepherdResolvedThread = (extra: ReviewThreadComment[] = []) =>
  makeCodeRabbitThread("PRRT_kwDOSaSRXM69AIEk", true, [
    comment("PRRC_root", ROOT_FINDING, "coderabbitai", 10),
    comment("PRRC_shepherd", SHEPHERD_REPLY, "jonathanong", 20),
    comment("PRRC_kwDOSaSRXM8AAAABGanCpw", RATE_LIMIT_REPLY, "coderabbitai", 30),
    ...extra,
  ]);

describe("runCheck — CodeRabbit chat rate-limit reply on review threads", () => {
  it("skips the rate-limit reply on a Shepherd-resolved thread and drops it from activity", async () => {
    mockLoadClassifyRules.mockResolvedValue(coderabbitRule.current);
    const thread = shepherdResolvedThread();
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [thread],
        activity: {
          commitCount: 1,
          reviewRoundCount: 1,
          latestCommitCommittedAtUnix: 15,
          reviewItemsSinceLatestCommit: thread.comments!.slice(1).map((c) => ({
            kind: "review-thread-comment" as const,
            id: c.id,
            threadId: thread.id,
            author: c.author,
            authorType: c.authorType,
            body: c.body,
            createdAtUnix: c.createdAtUnix,
          })),
        },
      }),
    });

    const report = await runCheck({ ...BASE_OPTS, autoMinimizeSuppressed: true });

    expect(report.threads.firstLook).toEqual([]);
    expect(report.threads.actionable).toEqual([]);
    expect(report.threads.resolutionOnly).toEqual([]);
    expect(report.status).toBe("READY");
    expect(report.activity?.reviewItemsSinceLatestCommit.map((item) => item.id)).toEqual([
      "PRRC_shepherd",
    ]);
  });

  it("surfaces the resolved thread as first-look when coderabbit-notices is disabled", async () => {
    mockLoadClassifyRules.mockResolvedValue([]);
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({ reviewThreads: [shepherdResolvedThread()] }),
    });

    const report = await runCheck(BASE_OPTS);

    expect(report.threads.firstLook.map((t) => t.id)).toEqual(["PRRT_kwDOSaSRXM69AIEk"]);
    expect(report.threads.firstLook[0]?.firstLookStatus).toBe("resolved");
  });

  it("does not re-surface a previously seen human-resolved thread after a rate-limit reply", async () => {
    mockLoadClassifyRules.mockResolvedValue(coderabbitRule.current);
    const humanReply = "Done in the latest push.";
    const thread = makeCodeRabbitThread("PRRT_human_resolved", true, [
      comment("PRRC_root", ROOT_FINDING, "coderabbitai", 10),
      comment("PRRC_human", humanReply, "jonathanong", 20),
      comment("PRRC_rate_limit", RATE_LIMIT_REPLY, "coderabbitai", 30),
    ]);
    mockLoadSeenMap.mockResolvedValue(
      new Map([
        [
          thread.id,
          { seenAt: 1000, bodyHash: hashBody(threadTranscriptBodies([ROOT_FINDING, humanReply])) },
        ],
      ]),
    );
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    const report = await runCheck(BASE_OPTS);

    expect(report.threads.firstLook).toEqual([]);
    expect(report.status).toBe("READY");
  });

  it("keeps an unresolved thread actionable while stripping only the rate-limit reply", async () => {
    mockLoadClassifyRules.mockResolvedValue(coderabbitRule.current);
    const thread = makeCodeRabbitThread("PRRT_open", false, [
      comment("PRRC_root", ROOT_FINDING, "coderabbitai", 10),
      comment("PRRC_rate_limit", RATE_LIMIT_REPLY, "coderabbitai", 20),
    ]);
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    const report = await runCheck(BASE_OPTS);

    expect(report.threads.actionable.map((t) => t.id)).toEqual(["PRRT_open"]);
    expect(report.threads.actionable[0]?.comments?.map((c) => c.id)).toEqual(["PRRC_root"]);
  });

  it("still surfaces a resolved thread when a real reply follows the rate-limit notice", async () => {
    mockLoadClassifyRules.mockResolvedValue(coderabbitRule.current);
    const thread = shepherdResolvedThread([
      comment("PRRC_followup", "This still panics on empty input.", "coderabbitai", 40),
    ]);
    mockFetchPrBatch.mockResolvedValue({ data: makeBatchData({ reviewThreads: [thread] }) });

    const report = await runCheck(BASE_OPTS);

    expect(report.threads.firstLook.map((t) => t.id)).toEqual(["PRRT_kwDOSaSRXM69AIEk"]);
    expect(report.threads.firstLook[0]?.comments?.map((c) => c.id)).toEqual([
      "PRRC_root",
      "PRRC_shepherd",
      "PRRC_followup",
    ]);
  });
});
