import { describe, expect, it } from "vitest";
import { harness, input } from "../../test-helpers/github/merge-boundary-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { runApplyMerge } from "./apply-merge.mts";

/**
 * Request budget of the REST-mode merge command the iterate output prints on the REST transport
 * (`buildMergeCommandPlan` in src/commands/iterate/merge-plan.mts), measured at the HTTP
 * boundary. It sends no GraphQL request. Its pull and stack reads are conditional in the PR's
 * ETag cache, but on a cold cache nothing is stored, so all three are sent without a validator
 * and charged. After the iterate tick that printed the command they answer 304
 * (apply-merge-warm-cost.test.mts), which is what evals/tokens/scenarios.mjs charges.
 */
describe("apply merge request budget", () => {
  it.each(["direct_merge", "merge_queue"] as const)(
    "spends three REST requests and no GraphQL on an unstacked %s with a cold cache",
    async (mergeAction) => {
      await runWithGithubTransport("rest", () =>
        runApplyMerge({
          ...input,
          mergeAction,
          ...(mergeAction === "merge_queue" && { mergeMethod: undefined }),
        }),
      );
      const requests = harness.wire.requests.map(
        ({ method, path }) => `${method} ${path.split("?")[0]}`,
      );
      expect(requests).toEqual([
        "GET /repos/owner/repo/pulls/1",
        "GET /repos/owner/repo/stacks",
        "PUT /repos/owner/repo/pulls/1/merge-async",
      ]);
      expect(harness.wire.requests.some(({ headers }) => headers?.["if-none-match"])).toBe(false);
    },
  );
});
