import { describe, expect, it } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
  mockUpdateReadyDelay,
} from "../../test-helpers/commands/iterate-test-support.mts";
import { hashBody, loadSeenMap, markSeen } from "../state/seen-comments.mts";
import { runIterate } from "./iterate/index.mts";
import type { EditedComment } from "../types.mts";

registerIterateHooks();

const key = { owner: "owner", repo: "repo", pr: 42 };

function edited(id: string, body: string, isMinimized = true): EditedComment {
  return {
    id,
    isMinimized,
    author: "coderabbitai",
    authorType: "Bot",
    body,
    url: "",
    createdAtUnix: 0,
    edited: true,
  };
}

/** Writes the first-look marker, then returns a READY report carrying the edited body. */
async function readyReportWithEdit(id: string, overrides: Parameters<typeof makeReport>[0] = {}) {
  await markSeen(key, id, "original");
  return makeReport({
    status: "READY",
    ...overrides,
    comments: {
      actionable: [],
      firstLook: [],
      ...overrides.comments,
      edited: [edited(id, "regenerated")],
    },
  });
}

async function storedHash(id: string) {
  return (await loadSeenMap(key)).get(id)?.bodyHash;
}

describe("runIterate — edited PR comments", () => {
  it("holds an edit during the ready countdown without writing its marker", async () => {
    mockRunCheck.mockResolvedValue(await readyReportWithEdit("c-countdown"));

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("ready");
    expect(result).not.toHaveProperty("editedComments");
    expect(await storedHash("c-countdown")).toBe(hashBody("original"));
  });

  it("shows the edit once on the cancel that ends the ready delay", async () => {
    mockRunCheck.mockResolvedValue(await readyReportWithEdit("c-cancel"));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const first = await runIterate(makeOpts());
    expect(first).toMatchObject({
      action: "cancel",
      reason: "ready-delay-elapsed",
      editedComments: [{ id: "c-cancel", body: "regenerated" }],
    });
    expect(await storedHash("c-cancel")).toBe(hashBody("regenerated"));

    // check reuses its earlier classification (e.g. a fingerprint replay); iterate drops it.
    expect(await runIterate(makeOpts())).not.toHaveProperty("editedComments");
  });

  it("still returns merge with --merge and shows the edit", async () => {
    mockRunCheck.mockResolvedValue(await readyReportWithEdit("c-merge"));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts({ merge: true }));

    expect(result).toMatchObject({ action: "merge", editedComments: [{ id: "c-merge" }] });
  });

  it("rides along on fix_code caused by other work", async () => {
    mockRunCheck.mockResolvedValue(
      await readyReportWithEdit("c-fix", {
        status: "UNRESOLVED_COMMENTS",
        comments: {
          actionable: [
            {
              id: "c-new",
              isMinimized: false,
              author: "alice",
              authorType: "User",
              body: "Please add a test.",
              url: "",
              createdAtUnix: 0,
            },
          ],
          firstLook: [],
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts());

    expect(result.action).toBe("fix_code");
    expect(result.editedComments?.map((c) => c.id)).toEqual(["c-fix"]);
  });

  it("shows but does not mark the edit on a discarded debounced fix_code tick", async () => {
    mockRunCheck.mockResolvedValue(
      await readyReportWithEdit("c-debounce", {
        status: "UNRESOLVED_COMMENTS",
        comments: {
          actionable: [
            {
              id: "c-new2",
              isMinimized: false,
              author: "alice",
              authorType: "User",
              body: "Please add a test.",
              url: "",
              createdAtUnix: 0,
            },
          ],
          firstLook: [],
        },
      }),
    );
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: false,
      shouldCancel: false,
      remainingSeconds: 600,
    });

    const result = await runIterate(makeOpts({ persistSeen: false }));

    expect(result.action).toBe("fix_code");
    expect(result.editedComments?.map((c) => c.id)).toEqual(["c-debounce"]);
    expect(await storedHash("c-debounce")).toBe(hashBody("original"));
  });

  it("marks the edit on a returned poll tick even before the debounce starts", async () => {
    mockRunCheck.mockResolvedValue(await readyReportWithEdit("c-poll-cancel"));
    mockUpdateReadyDelay.mockResolvedValue({
      isReady: true,
      shouldCancel: true,
      remainingSeconds: 0,
    });

    const result = await runIterate(makeOpts({ persistSeen: false }));

    expect(result.editedComments?.map((c) => c.id)).toEqual(["c-poll-cancel"]);
    expect(await storedHash("c-poll-cancel")).toBe(hashBody("regenerated"));
  });

  it("omits and does not mark the edit when the PR is merged", async () => {
    const report = await readyReportWithEdit("c-merged");
    mockRunCheck.mockResolvedValue({
      ...report,
      mergeStatus: { ...report.mergeStatus, state: "MERGED" },
    });

    const result = await runIterate(makeOpts());

    expect(result).toMatchObject({ action: "cancel", reason: "merged" });
    expect(result).not.toHaveProperty("editedComments");
    expect(await storedHash("c-merged")).toBe(hashBody("original"));
  });
});
