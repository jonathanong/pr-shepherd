import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const { mockFind } = vi.hoisted(() => ({ mockFind: vi.fn() }));
vi.mock("./existing-reply-scan.mts", () => ({ findExistingReplies: mockFind }));

import {
  registerHooks,
  REPO,
  mockGraphql,
} from "../../test-helpers/comments/resolve.test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { applyResolveOptions } from "./resolve.mts";

registerHooks();

beforeEach(() => {
  mockFind.mockReset();
  mockFind.mockResolvedValue(["t-1"]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("applyResolveOptions — existing-reply adoption", () => {
  it("forwards every supplied reply ID on a direct apply request, even with durable state", async () => {
    // A cloud session keeps durable state; pin GraphQL so the mutation goes through the mock.
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    const result = await runWithGithubTransport("graphql", () =>
      applyResolveOptions(1, REPO, {
        replyThreadIds: ["t-1"],
        dismissMessage: "Addressed.",
      }),
    );
    expect(mockFind).not.toHaveBeenCalled();
    expect(result.repliedThreads).toEqual(["t-1"]);
    const doc = mockGraphql.mock.calls[0]?.[0] as string;
    expect(doc).toContain('pullRequestReviewThreadId: "t-1"');
  });

  it("adopts an existing reply only when the generated command opts in", async () => {
    const result = await applyResolveOptions(1, REPO, {
      replyThreadIds: ["t-1"],
      dismissMessage: "Addressed.",
      adoptExistingReplies: true,
    });
    expect(mockFind).toHaveBeenCalledWith({ repo: REPO, pr: 1 }, ["t-1"], "Addressed.", undefined);
    expect(result.repliedThreads).toEqual(["t-1"]);
    const docs = mockGraphql.mock.calls.map((call) => String(call[0])).join("\n");
    expect(docs).not.toContain("addPullRequestReviewThreadReply");
  });
});
