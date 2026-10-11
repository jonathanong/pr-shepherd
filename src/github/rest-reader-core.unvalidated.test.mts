import { describe, expect, it } from "vitest";
import { wire, serve, prefix, pull } from "../../test-helpers/github/rest-read.test-support.mts";
import { readRest } from "./rest-reader-core.mts";
import { restSnapshotState, withRestConditionalScope } from "./rest-conditional-scope.mts";

const key = { owner: "octocat", repo: "hello-world", pr: 101 };

describe("REST reads without a validator", () => {
  it("validates a settled body without an ETag by content, never an unsettled pull", async () => {
    let threads = "[]";
    const pullPath = `${prefix}/pulls/101`;
    await serve((request, response) =>
      response.end(
        request.path === pullPath ? JSON.stringify({ ...pull, mergeable: null }) : threads,
      ),
    );
    const read = (path: string) =>
      withRestConditionalScope(key, async () => {
        await readRest("GET", path);
        return restSnapshotState();
      });
    const ccr = `${pullPath}/ccr/review_threads`;
    const first = await read(ccr);
    const same = await read(ccr);
    threads = '[{"resolved":true}]';
    const changed = await read(ccr);
    // Without validators a read is a charged 200 every time, but an unchanged body matches.
    expect(wire.requests).toHaveLength(3);
    expect(same?.digest).toBe(first?.digest);
    expect(changed?.digest).not.toBe(first?.digest);
    // No 304 at all is never a reusable snapshot, nor is an unsettled pull.
    expect(same?.allNotModified).toBe(false);
    expect((await read(pullPath))?.allNotModified).toBe(false);
  });
});
