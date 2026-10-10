import { describe, expect, it } from "vitest";
import { repo } from "../../test-helpers/github/rest-read.test-support.mts";
import { serveViewerFeedback } from "../../test-helpers/github/rest-viewer-feedback.test-support.mts";
import { readRestFeedback } from "./rest-feedback-read.mts";
import { readRestViewerLogin } from "./rest-viewer-read.mts";

describe("optional REST authenticated viewer evidence", () => {
  it.each([401, 403, 404])(
    "preserves readable feedback with unknown viewer for unsupported or denied identity HTTP %s",
    async (status) => {
      const fixture = await serveViewerFeedback();
      fixture.viewerStatus = status;
      fixture.viewer = { message: "Resource not accessible by integration" };
      const feedback = await readRestFeedback(101, repo);
      expect(feedback.viewerLogin).toBeNull();
      expect(feedback.threads).toHaveLength(3);
      expect(feedback.threads.every((thread) => thread.viewerDidAuthor === undefined)).toBe(true);
      expect(
        feedback.threads
          .flatMap((thread) => thread.comments ?? [])
          .every((comment) => comment.viewerDidAuthor === undefined),
      ).toBe(true);
    },
  );

  it.each([null, [], {}, { login: "" }, { login: 123 }])(
    "keeps absent or malformed viewer principal unknown: %j",
    async (body) => {
      const fixture = await serveViewerFeedback();
      fixture.viewer = body;
      expect(await readRestViewerLogin()).toBeNull();
    },
  );

  it.each([
    { status: 403, body: { message: "You have exceeded a secondary rate limit" }, headers: {} },
    {
      status: 403,
      body: { message: "API rate limit exceeded" },
      headers: {
        "x-ratelimit-resource": "core",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-limit": "5000",
        "x-ratelimit-reset": "9999999999",
      },
    },
    { status: 403, body: { message: "Please retry later" }, headers: { "retry-after": "3" } },
    { status: 403, body: { message: "Endpoint is not enabled for this session" }, headers: {} },
    { status: 503, body: { message: "Service unavailable" }, headers: {} },
  ])(
    "propagates transient or proxy refusal instead of hiding it as unknown: %j",
    async ({ status, body, headers }) => {
      const fixture = await serveViewerFeedback();
      fixture.viewerStatus = status;
      fixture.viewer = body;
      fixture.viewerHeaders = headers as Record<string, string>;
      await expect(readRestFeedback(101, repo)).rejects.toMatchObject({ status });
    },
  );

  it("does not identify a deleted author as a real viewer named unknown", async () => {
    const fixture = await serveViewerFeedback();
    fixture.viewer = { login: "unknown" };
    fixture.inline = [
      { ...fixture.inline[0]!, user: null } as unknown as (typeof fixture.inline)[number],
    ];
    const feedback = await readRestFeedback(101, repo);
    expect(feedback.threads[0]?.author).toBe("unknown");
    expect(feedback.threads[0]).not.toHaveProperty("viewerDidAuthor");
  });
});
