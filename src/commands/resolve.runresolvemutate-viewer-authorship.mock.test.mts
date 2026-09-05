import { describe, it, expect } from "vitest";
import {
  registerHooks,
  BASE_OPTS,
  makeBatchData,
  makeThread,
  mockApplyResolveOptions,
  mockFetchPrBatch,
} from "../../test-helpers/commands/resolve.test-support.mts";
import { runResolveMutate } from "./resolve.mts";
import { addPrShepherdMarker } from "../comments/marker.mts";

registerHooks();

describe("runResolveMutate — viewer-authored human threads", () => {
  it("allows a viewer-authored human resolve when it is paired with a reply", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [
          makeThread({
            id: "t-viewer",
            author: "alice",
            authorType: "User",
            viewerDidAuthor: true,
          }),
        ],
      }),
    });

    const result = await runResolveMutate({
      ...BASE_OPTS,
      replyThreadIds: ["t-viewer"],
      resolveThreadIds: ["t-viewer"],
      dismissMessage: "done",
    });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({
        replyThreadIds: ["t-viewer"],
        resolveThreadIds: ["t-viewer"],
      }),
    );
    expect(result.skippedHumanResolves).toBeUndefined();
  });

  it("skips an unmarked viewer-authored human resolve when no reply is paired", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [
          makeThread({
            id: "t-viewer",
            author: "alice",
            authorType: "User",
            viewerDidAuthor: true,
          }),
        ],
      }),
    });

    const result = await runResolveMutate({
      ...BASE_OPTS,
      resolveThreadIds: ["t-viewer"],
    });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({ resolveThreadIds: [] }),
    );
    expect(result.skippedHumanResolves).toEqual(["t-viewer"]);
  });

  it("allows a marker-ended viewer-authored human resolve without another reply", async () => {
    mockFetchPrBatch.mockResolvedValue({
      data: makeBatchData({
        reviewThreads: [
          makeThread({
            id: "t-viewer",
            author: "alice",
            authorType: "User",
            viewerDidAuthor: true,
            comments: [
              {
                id: "c-human",
                isMinimized: false,
                author: "alice",
                authorType: "User",
                viewerDidAuthor: true,
                body: "please fix",
                url: "",
                createdAtUnix: 1,
              },
              {
                id: "c-shepherd",
                isMinimized: false,
                author: "alice",
                authorType: "User",
                viewerDidAuthor: true,
                body: addPrShepherdMarker("done"),
                url: "",
                createdAtUnix: 2,
              },
            ],
          }),
        ],
      }),
    });

    const result = await runResolveMutate({
      ...BASE_OPTS,
      resolveThreadIds: ["t-viewer"],
    });

    expect(mockApplyResolveOptions).toHaveBeenCalledWith(
      42,
      { owner: "owner", name: "repo" },
      expect.objectContaining({ resolveThreadIds: ["t-viewer"] }),
    );
    expect(result.skippedHumanResolves).toBeUndefined();
  });
});
