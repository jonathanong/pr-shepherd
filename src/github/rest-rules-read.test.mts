import { describe, expect, it } from "vitest";
import { serve, repo, wire } from "../../test-helpers/github/rest-read.test-support.mts";
import { readRestBranchRules } from "./rest-rules-read.mts";
import { parseBranchRules } from "./batch-parsers-rules.mts";

describe("REST protection and rulesets", () => {
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
