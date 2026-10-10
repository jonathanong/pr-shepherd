import { describe, expect, it } from "vitest";
import { serve, pull, repo } from "../../test-helpers/github/rest-read.test-support.mts";
import { readRestPull } from "./rest-pr-core.mts";
import { readRestMergedBasePullRequests } from "./rest-merged-base-read.mts";

describe("REST pull evidence boundaries", () => {
  it.each([
    [{ number: 102 }, "identity changed"],
    [{ merged_at: 123 }, "merged_at"],
    [{ updated_at: "not-a-date" }, "revision timestamp"],
  ])("rejects invalid pull identity or revision %#", async (overrides, reason) => {
    await serve((_request, response) => response.end(JSON.stringify({ ...pull, ...overrides })));
    await expect(readRestPull(101, repo)).rejects.toThrow(reason);
  });

  it.each([undefined, "not-a-date"])(
    "rejects unverifiable merged timestamp %s",
    async (merged_at) => {
      await serve((_request, response) =>
        response.end(JSON.stringify([{ ...pull, state: "closed", merged_at }])),
      );
      await expect(
        readRestMergedBasePullRequests({
          owner: repo.owner,
          repo: repo.name,
          baseRefName: pull.head.ref,
          baseRefOid: pull.head.sha,
        }),
      ).rejects.toThrow("closed pull merged_at");
    },
  );
});
