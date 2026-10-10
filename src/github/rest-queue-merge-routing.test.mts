import { describe, expect, it } from "vitest";
import {
  serve,
  wire,
  repo,
  prefix,
  pull,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { restIterateRoutes } from "../../test-helpers/github/rest-iterate-routes.test-support.mts";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";

describe("REST queue policy in one-PR merge instructions", () => {
  it.each([
    { classic: false, configured: "squash", expected: "direct_merge" },
    { classic: true, configured: undefined, expected: "default" },
    { classic: true, configured: "squash", expected: "escalate" },
  ])(
    "routes complete empty rules with classic policy %j",
    async ({ classic, configured, expected }) => {
      if (configured) writeRc(`merge:\n  method: ${configured}\n`);
      await freshLoadConfig();
      const [{ runIterate }, { runWithGithubTransport }] = await Promise.all([
        import("../commands/iterate/index.mts"),
        import("./transport.mts"),
      ]);
      const routes = restIterateRoutes();
      await serve((request, response) => {
        if (request.path.split("?")[0] === `${prefix}/pulls/101`)
          response.end(JSON.stringify({ ...pull, head: { ...pull.head, sha: "a".repeat(40) } }));
        else if (request.path.endsWith("/protection")) {
          if (classic) response.end("{}");
          else {
            response.statusCode = 404;
            response.end('{"message":"Branch not protected"}');
          }
        } else {
          void routes(request, response);
        }
      });

      const result = await runWithGithubTransport("rest", () =>
        runIterate({
          prNumber: 101,
          targetRepository: repo,
          format: "json",
          merge: true,
          readyDelaySeconds: 0,
          stallTimeoutSeconds: 0,
          noAutoMarkReady: true,
        }),
      );

      if (expected === "escalate") {
        expect(result).toMatchObject({
          action: "escalate",
          escalate: { triggers: ["merge-method-unavailable"] },
        });
      } else {
        expect(result.action).toBe("merge");
        if (result.action !== "merge") throw new Error(`Unexpected action ${result.action}`);
        expect(result.merge.command.argv).toEqual(
          expect.arrayContaining(["--merge-action", expected]),
        );
        if (expected === "direct_merge")
          expect(result.merge.command.argv).toEqual(expect.arrayContaining(["--method", "squash"]));
        else expect(result.merge.command.argv).not.toContain("--method");
      }
      expect(
        wire.requests.every(({ method, path }) => method === "GET" && path !== "/graphql"),
      ).toBe(true);
    },
  );
});
