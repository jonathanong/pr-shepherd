import { describe, expect, it } from "vitest";
import {
  serve,
  wire,
  repo,
  prefix,
  pull,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { readMergeRequest } from "../state/merge-request.mts";
import { runApplyMerge } from "./apply-merge.mts";

describe("unparseable JSON returned after an asynchronous merge submission", () => {
  it.each([200, 202, 400, 409])(
    "retains the certainty of HTTP %s and never repeats the same request",
    async (status) => {
      const head = "a".repeat(40);
      await serve((request, response) => {
        if (request.method === "PUT") {
          response.statusCode = status;
          response.end("{");
        } else if (request.path === `${prefix}/pulls/101`) {
          response.end(JSON.stringify({ ...pull, merged: false, head: { sha: head } }));
        } else if (request.path.startsWith(`${prefix}/stacks?`)) {
          response.end("[]");
        } else {
          response.statusCode = 404;
          response.end(JSON.stringify({ message: `Unexpected route ${request.path}` }));
        }
      });
      const apply = () =>
        runWithGithubTransport("rest", () =>
          runApplyMerge({
            prNumber: 101,
            targetRepository: repo,
            requireSha: head,
            mergeAction: "default",
          }),
        );

      if (status >= 400) {
        await expect(apply()).rejects.toMatchObject({ status });
        const recorded = await readMergeRequest({ owner: repo.owner, repo: repo.name, pr: 101 });
        expect(recorded?.response).toMatchObject({ status: "failed" });
        expect(recorded?.uncertain).toBeUndefined();
        await expect(apply()).resolves.toMatchObject({ status: "failed" });
      } else {
        await expect(apply()).resolves.toMatchObject({ status: "failed", uncertain: true });
        const recorded = await readMergeRequest({ owner: repo.owner, repo: repo.name, pr: 101 });
        expect(recorded?.response).toBeUndefined();
        expect(recorded?.uuid).toBeUndefined();
        await expect(apply()).resolves.toMatchObject({ status: "failed", uncertain: true });
      }
      expect(wire.requests.filter(({ method }) => method === "PUT")).toHaveLength(1);
    },
  );
});
