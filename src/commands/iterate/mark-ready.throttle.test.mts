import { describe, expect, it, vi } from "vitest";
import { wire, serve } from "../../../test-helpers/github/rest-read.test-support.mts";
import { base, report } from "../../../test-helpers/github/mark-ready.test-support.mts";
import { runWithGithubTransport } from "../../github/transport.mts";
import { markReadyIfAuthorized } from "./mark-ready.mts";
import { GitHubRequestError } from "../../github/errors.mts";
import { EXIT } from "../../exit-codes.mts";

const authorizedReport = {
  ...report,
  viewerAuthorization: {
    viewerCanUpdate: true,
    repositoryPermission: "WRITE" as const,
    headRepositoryPermission: "WRITE" as const,
  },
};

describe.each(["rest", "graphql", "auto"] as const)(
  "%s mark-ready throttle handling",
  (transport) => {
    it.each([
      { message: "You have exceeded a secondary rate limit", remaining: undefined },
      { message: "You have exceeded a secondary rate limit", remaining: 20 },
      { message: "You have triggered an abuse detection mechanism", remaining: 20 },
      { message: "API rate limit exceeded", remaining: undefined },
      { message: "Please retry later", remaining: 20, retryAfter: 5 },
      { message: "API rate limit exceeded", remaining: 0 },
    ])(
      "propagates retryable HTTP 403 %j without an authorization handoff",
      async ({ message, remaining, retryAfter }) => {
        if (transport === "rest") vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
        await serve((_request, response) => {
          response.statusCode = 403;
          if (remaining !== undefined) {
            response.setHeader("x-ratelimit-resource", transport === "rest" ? "core" : "graphql");
            response.setHeader("x-ratelimit-remaining", String(remaining));
            response.setHeader("x-ratelimit-limit", "5000");
            response.setHeader("x-ratelimit-reset", "9999999999");
          }
          if (retryAfter !== undefined) response.setHeader("retry-after", String(retryAfter));
          response.end(JSON.stringify({ message }));
        });
        // Auto deliberately falls back only for a proven empty primary GraphQL bucket.
        if (transport === "auto" && remaining === 0) {
          expect(
            await runWithGithubTransport(transport, () =>
              markReadyIfAuthorized(true, base, authorizedReport),
            ),
          ).toMatchObject({
            action: "escalate",
            escalate: { triggers: ["transport-unsupported"] },
          });
        } else {
          const error = await runWithGithubTransport(transport, () =>
            markReadyIfAuthorized(true, base, authorizedReport),
          ).then(
            () => null,
            (error: unknown) => error,
          );
          expect(error).toBeInstanceOf(GitHubRequestError);
          expect(error).toMatchObject({ status: 403, exitCode: EXIT.TEMPFAIL });
        }
        expect(wire.requests.filter(({ method }) => method === "POST")).toMatchObject([
          {
            path:
              transport === "rest"
                ? "/repos/octocat/hello-world/pulls/101/ccr/ready_for_review"
                : "/graphql",
          },
        ]);
        expect(wire.requests).toHaveLength(
          transport === "auto" && message === "API rate limit exceeded" && remaining === undefined
            ? 2
            : 1,
        );
      },
    );

    it("still escalates a definite forbidden response as authorization-required", async () => {
      if (transport === "rest") vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
      await serve((_request, response) => {
        response.statusCode = 403;
        response.end('{"message":"Resource not accessible by integration"}');
      });
      expect(
        await runWithGithubTransport(transport, () =>
          markReadyIfAuthorized(true, base, authorizedReport),
        ),
      ).toMatchObject({ action: "escalate", escalate: { triggers: ["authorization-required"] } });
      expect(wire.requests).toHaveLength(1);
    });
  },
);
