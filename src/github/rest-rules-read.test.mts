import { describe, expect, it } from "vitest";
import { serve, repo, wire } from "../../test-helpers/github/rest-read.test-support.mts";
import { readRestBranchRules } from "./rest-rules-read.mts";
import { parseBranchRules } from "./batch-parsers-rules.mts";
import { restQueueRequirement } from "./poll-summary-rest-queue.mts";

describe("REST protection and rulesets", () => {
  it.each(["Branch not protected", '{"message":"Branch not protected"'])(
    "does not infer classic protection absence from an unparseable HTTP 404 body: %j",
    async (body) => {
      await serve((request, response) => {
        if (request.path.includes("/protection")) {
          response.statusCode = 404;
          response.end(body);
        } else response.end("[]");
      });
      const result = await readRestBranchRules(repo, "main");
      expect(result.unavailable).toEqual([expect.objectContaining({ field: "branchProtection" })]);
      expect(
        restQueueRequirement({
          baseRef: result.baseRef,
          transportUnavailable: result.unavailable,
        }),
      ).toBeUndefined();
    },
  );

  it("preserves unknown queue policy when classic protection exists without a readable queue field", async () => {
    await serve((request, response) =>
      response.end(request.path.includes("/protection") ? "{}" : "[]"),
    );
    const result = await readRestBranchRules(repo, "main");
    expect(result.unavailable).toEqual([]);
    expect(result.baseRef?.branchProtectionRule).not.toBeNull();
    expect(
      restQueueRequirement({ baseRef: result.baseRef, transportUnavailable: result.unavailable }),
    ).toBeUndefined();
  });

  it.each([
    { protectionStatus: 404, message: "Branch not protected", required: false },
    { protectionStatus: 404, message: "Not Found", required: undefined },
    { protectionStatus: 403, message: "Branch not protected", required: undefined },
    {
      protectionStatus: 403,
      message: "Resource not accessible by integration",
      required: undefined,
    },
  ])(
    "keeps queue absence distinct from inaccessible classic protection: %j",
    async ({ protectionStatus, message, required }) => {
      await serve((request, response) => {
        if (request.path.includes("/protection")) {
          response.statusCode = protectionStatus;
          response.end(JSON.stringify({ message }));
        } else response.end("[]");
      });
      const result = await readRestBranchRules(repo, "main");
      expect(result.baseRef?.rules).toMatchObject({ nodes: [], pageInfo: { hasNextPage: false } });
      expect(result.unavailable).toEqual(
        required === false ? [] : [expect.objectContaining({ field: "branchProtection" })],
      );
      expect(
        restQueueRequirement({
          baseRef: result.baseRef,
          transportUnavailable: result.unavailable,
        }),
      ).toBe(required);
    },
  );

  it("preserves unknown queue policy when an explicitly unprotected branch has unavailable rules", async () => {
    await serve((request, response) => {
      response.statusCode = request.path.includes("/protection") ? 404 : 403;
      response.end(
        JSON.stringify({
          message: request.path.includes("/protection")
            ? "Branch not protected"
            : "Resource not accessible by integration",
        }),
      );
    });
    const result = await readRestBranchRules(repo, "main");
    expect(result.unavailable).toEqual([expect.objectContaining({ field: "branchRules" })]);
    expect(
      restQueueRequirement({
        baseRef: result.baseRef,
        transportUnavailable: result.unavailable,
      }),
    ).toBeUndefined();
  });

  it("combines required checks, reviews, deployments and standalone rule types", async () => {
    await serve((request, response) =>
      response.end(
        JSON.stringify(
          request.path.includes("/protection")
            ? {
                required_pull_request_reviews: {
                  required_approving_review_count: 1,
                  require_code_owner_reviews: true,
                  require_last_push_approval: true,
                },
                required_status_checks: { contexts: ["classic"], strict: true },
                required_conversation_resolution: { enabled: true },
                required_signatures: { enabled: true },
                required_linear_history: { enabled: true },
              }
            : [
                {
                  type: "pull_request",
                  parameters: {
                    required_approving_review_count: 2,
                    required_review_thread_resolution: true,
                    require_code_owner_review: true,
                    require_last_push_approval: true,
                  },
                },
                {
                  type: "required_status_checks",
                  parameters: {
                    strict_required_status_checks_policy: true,
                    required_status_checks: [{ context: "ruleset" }],
                  },
                },
                {
                  type: "required_deployments",
                  parameters: { required_deployment_environments: ["production"] },
                },
                { type: "merge_queue" },
              ],
        ),
      ),
    );
    const result = await readRestBranchRules(repo, "release/next");
    expect(result.unavailable).toEqual([]);
    expect(parseBranchRules(result.baseRef)).toMatchObject({
      requiredApprovingReviewCount: 2,
      requiresConversationResolution: true,
      requiresCodeOwnerReviews: true,
      requiresLastPushApproval: true,
      requiresCommitSignatures: true,
      requiresLinearHistory: true,
      requiresStrictStatusChecks: true,
      requiredStatusCheckContexts: ["classic", "ruleset"],
      requiredDeploymentEnvironments: ["production"],
      requiresMergeQueue: true,
    });
    expect(wire.requests.every((request) => request.path.includes("release%2Fnext"))).toBe(true);
  });

  it("keeps both policy gaps explicit when protection and rules are inaccessible", async () => {
    await serve((request, response) => {
      response.statusCode = request.path.includes("/protection") ? 404 : 403;
      response.end('{"message":"Not accessible"}');
    });
    expect(await readRestBranchRules(repo, "main")).toMatchObject({
      unavailable: [{ field: "branchProtection" }, { field: "branchRules" }],
    });
  });

  it.each(["protection", "rules"])("propagates an upstream %s failure", async (kind) => {
    await serve((request, response) => {
      if (request.path.includes("/protection") === (kind === "protection")) {
        response.statusCode = 503;
        response.end('{"message":"Unavailable"}');
      } else response.end("{}");
    });
    await expect(readRestBranchRules(repo, "main")).rejects.toMatchObject({ status: 503 });
  });
});
