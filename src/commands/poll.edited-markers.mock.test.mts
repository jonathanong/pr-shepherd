import { describe, it, expect, vi } from "vitest";
import {
  mockRunIterate,
  makeCancelResult,
  makeWaitResult,
  registerPollHooks,
} from "../../test-helpers/commands/poll.test-support.mts";
import { markEditedCommentsSeen } from "./iterate/edited-comment-markers.mts";
import { runPoll } from "./poll.mts";

vi.mock("./iterate/edited-comment-markers.mts", () => ({
  markEditedCommentsSeen: vi.fn(async (result: unknown) => result),
}));
const mockMark = vi.mocked(markEditedCommentsSeen);

registerPollHooks();

describe("runPoll — edited comment markers", () => {
  it("marks edits only on the result it returns", async () => {
    const returned = makeCancelResult();
    mockRunIterate.mockResolvedValueOnce(makeWaitResult()).mockResolvedValueOnce(returned);

    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const pollPromise = runPoll({
      prNumber: 42,
      format: "text",
      intervalSeconds: 30,
      timeoutSeconds: 300,
    });
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pollPromise;
    stderrSpy.mockRestore();

    expect(result).toBe(returned);
    expect(mockMark.mock.calls).toEqual([[returned]]);
    expect(mockRunIterate.mock.calls.every((c) => c[0].deferEditedCommentMarkers)).toBe(true);
  });
});
