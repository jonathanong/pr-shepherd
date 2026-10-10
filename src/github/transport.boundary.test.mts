import { describe, expect, it } from "vitest";
import { serve, wire } from "../../test-helpers/github/rest-read.test-support.mts";
import { graphql } from "./http.mts";
import { githubOperation, runWithGithubTransport, getGithubTransport } from "./transport.mts";

describe("mixed GraphQL engine and application failures", () => {
  it("propagates a mixed INTERNAL and execution error without calling REST or latching fallback", async () => {
    await serve((_request, response) =>
      response.end(
        JSON.stringify({
          data: null,
          errors: [
            { type: "INTERNAL", message: "Internal failure" },
            { type: "UNPROCESSABLE", message: "Input could not be processed" },
          ],
        }),
      ),
    );
    await runWithGithubTransport("auto", async () => {
      let restCalls = 0;
      await expect(
        githubOperation(
          "mixed.read",
          () => graphql("query { viewer { login } }"),
          async () => {
            restCalls += 1;
            return { data: null };
          },
        ),
      ).rejects.toMatchObject({
        graphqlErrors: expect.arrayContaining([
          { type: "UNPROCESSABLE", message: "Input could not be processed" },
        ]),
      });
      expect(restCalls).toBe(0);
      expect(getGithubTransport()).toBe("graphql");
    });
    expect(wire.requests.every(({ path }) => path === "/graphql")).toBe(true);
  });
});
