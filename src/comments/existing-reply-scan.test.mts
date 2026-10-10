import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockRead } = vi.hoisted(() => ({ mockRead: vi.fn() }));
vi.mock("../github/reply-recovery-read.mts", () => ({ readReplyRecoveryEvidence: mockRead }));

import { findExistingReplies } from "./existing-reply-scan.mts";
import { addPrShepherdMarker } from "./marker.mts";

const ctx = { repo: { owner: "o", name: "r" }, pr: 1 };
const message = "Fixed in abc123.";

function evidence(body: string, author: string | null, viewer = "bot") {
  return { viewer, comments: [{ id: "c", body, author }] };
}

beforeEach(() => {
  mockRead.mockReset();
  vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("findExistingReplies", () => {
  it("does nothing outside durable sessions or with no ids", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "");
    expect(await findExistingReplies(ctx, ["T1"], message)).toEqual([]);
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    expect(await findExistingReplies(ctx, [], message)).toEqual([]);
    expect(mockRead).not.toHaveBeenCalled();
  });

  it("adopts threads whose last comment is this reply from the viewer", async () => {
    mockRead.mockResolvedValue(
      new Map([
        ["T1", evidence(addPrShepherdMarker(message), "BOT")],
        ["T2", evidence("someone else's note", "bot")],
        ["T3", evidence(addPrShepherdMarker(message), "human")],
        ["T4", evidence(addPrShepherdMarker(message), null)],
      ]),
    );
    expect(await findExistingReplies(ctx, ["T1", "T2", "T3", "T4", "T5"], message)).toEqual(["T1"]);
  });

  it("batches in tens and survives a failed read", async () => {
    const ids = Array.from({ length: 11 }, (_, i) => `T${i}`);
    mockRead
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(new Map([["T10", evidence(addPrShepherdMarker(message), "bot")]]));
    expect(await findExistingReplies(ctx, ids, message)).toEqual(["T10"]);
    expect(mockRead).toHaveBeenCalledTimes(2);
  });
});
