import { describe, expect, it } from "vitest";
import {
  wire,
  serve,
  nextLink,
  prefix,
  pull,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { readRest, readRestPages } from "./rest-reader-core.mts";
import { restSnapshotState, withRestConditionalScope } from "./rest-conditional-scope.mts";
import { summarizeApiTelemetry, withApiTelemetryScope } from "./api-telemetry.mts";

const key = { owner: "octocat", repo: "hello-world", pr: 101 };
const comments = `${prefix}/issues/101/comments`;
const rate = {
  "x-ratelimit-limit": "5000",
  "x-ratelimit-remaining": "4990",
  "x-ratelimit-used": "10",
  "x-ratelimit-reset": "1900000000",
  "x-ratelimit-resource": "core",
};

/** Two ETag-validated pages; a matching If-None-Match gets a body-less, Link-less 304. */
async function servePages(onRequest?: () => void) {
  await serve((request, response) => {
    onRequest?.();
    const page2 = request.path.includes("page=2");
    const tag = `W/"${page2 ? "p2" : "p1"}"`;
    for (const [name, value] of Object.entries(rate)) response.setHeader(name, value);
    if (response.req.headers["if-none-match"] === tag) {
      response.statusCode = 304;
      response.end();
      return;
    }
    response.setHeader("etag", tag);
    if (!page2) response.setHeader("link", nextLink(comments, 2));
    response.end(JSON.stringify([{ id: page2 ? 2 : 1 }]));
  });
}

const tick = () =>
  withApiTelemetryScope(() =>
    withRestConditionalScope(key, async () => ({
      pages: await readRestPages(comments),
      snapshot: restSnapshotState(),
      usage: summarizeApiTelemetry(),
    })),
  );

describe("REST conditional reads", () => {
  it("sends no validators outside a conditional scope", async () => {
    await servePages();
    await readRestPages(comments);
    await readRestPages(comments);
    expect(wire.requests).toHaveLength(4);
    expect(summarizeApiTelemetry()).toBeUndefined();
  });

  it("replays cached pages and their Link on 304 and tallies them as not modified", async () => {
    await servePages();
    const first = await tick();
    const second = await tick();
    expect(first.pages.nodes).toEqual([{ id: 1 }, { id: 2 }]);
    expect(second.pages.nodes).toEqual(first.pages.nodes);
    expect(wire.requests).toHaveLength(4);
    expect(first.snapshot?.allNotModified).toBe(false);
    expect(second.snapshot).toEqual({
      allNotModified: true,
      digest: first.snapshot?.digest,
    });
    expect(first.usage?.rest?.[0]).toMatchObject({
      resource: "core",
      requestCount: 2,
    });
    expect(first.usage?.rest?.[0]).not.toHaveProperty("notModified");
    // 304s consume no quota: they are tallied as notModified, not as requests.
    expect(second.usage?.rest?.[0]).toMatchObject({
      resource: "core",
      requestCount: 0,
      notModified: 2,
      remaining: 4990,
    });
  });

  it("is no longer all-304 after a page changes", async () => {
    await servePages();
    const first = await tick();
    await serve((request, response) => {
      response.setHeader("etag", `W/"new-${request.path}"`);
      response.end("[]");
    });
    const second = await tick();
    expect(second.pages.nodes).toEqual([]);
    expect(second.snapshot?.allNotModified).toBe(false);
    expect(second.snapshot?.digest).not.toBe(first.snapshot?.digest);
  });

  it("omits a quota-less 304 from usage instead of inventing limits", async () => {
    await servePages();
    await tick();
    await serve((_request, response) => {
      response.statusCode = 304;
      response.end();
    });
    const second = await tick();
    expect(second.pages.nodes).toEqual([{ id: 1 }, { id: 2 }]);
    expect(second.usage?.rest).toBeUndefined();
  });

  it("never replays a pull whose mergeability is still being computed", async () => {
    await serve((_request, response) => {
      response.setHeader("etag", `W/"pull-${wire.requests.length}"`);
      response.end(
        JSON.stringify({
          ...pull,
          mergeable: null,
          mergeable_state: "unknown",
        }),
      );
    });
    const read = () =>
      withRestConditionalScope(key, async () => {
        await readRest("GET", `${prefix}/pulls/101`);
        return restSnapshotState();
      });
    await read();
    const second = await read();
    expect(second?.allNotModified).toBe(false);
    expect(wire.requests).toHaveLength(2);
  });

  it("does not make non-GET requests conditional", async () => {
    await serve((_request, response) => response.end("{}"));
    await withRestConditionalScope(key, async () => {
      await readRest("POST", `${prefix}/x`, { a: 1 });
      expect(restSnapshotState()?.allNotModified).toBe(false);
    });
  });
});
