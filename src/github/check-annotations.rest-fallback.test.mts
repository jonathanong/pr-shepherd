import { describe, expect, it } from "vitest";
import { wire, serve, prefix } from "../../test-helpers/github/rest-read.test-support.mts";
import { fetchCheckRunAnnotationsBatch } from "./check-annotations-batch.mts";
import { readRestCheckAnnotations } from "./rest-annotation-read.mts";
import { runWithGithubTransport } from "./transport.mts";
import { resolveRestIdentity } from "./rest-identities.mts";

describe("REST annotations after a GraphQL snapshot", () => {
  it("refreshes actual check identities once before fetching a refused GraphQL batch", async () => {
    await serve((request, response) => {
      if (request.path === "/graphql") {
        response.statusCode = 403;
        response.end(
          JSON.stringify({
            message: "GitHub GraphQL is not available from Claude Code sessions",
          }),
        );
      } else if (request.path.includes("/commits/")) {
        response.end(
          JSON.stringify({
            total_count: 2,
            check_runs: [
              { id: 22, node_id: "opaque-check-one" },
              { id: 33, node_id: "opaque-check-two" },
            ],
          }),
        );
      } else {
        const id = request.path.includes("/22/") ? 22 : 33;
        response.end(
          JSON.stringify([
            {
              path: `src/check-${id}.mts`,
              start_line: 5,
              end_line: 5,
              annotation_level: "warning",
              message: `warning from ${id}`,
            },
          ]),
        );
      }
    });
    const result = await runWithGithubTransport("auto", () =>
      fetchCheckRunAnnotationsBatch(["opaque-check-one", "opaque-check-two"], {
        stateKey: { owner: "octocat", repo: "hello-world", pr: 101 },
        headSha: "aaa111",
      }),
    );
    expect(result.failures).toEqual([]);
    expect(result.annotations.get("opaque-check-one")).toMatchObject([
      { path: "src/check-22.mts", message: "warning from 22" },
    ]);
    expect(result.annotations.get("opaque-check-two")).toMatchObject([
      { path: "src/check-33.mts", message: "warning from 33" },
    ]);
    expect(wire.requests.slice(0, 2).map((request) => request.path)).toEqual([
      "/graphql",
      `${prefix}/commits/aaa111/check-runs?filter=all&per_page=100`,
    ]);
    expect(
      wire.requests
        .slice(2)
        .map((request) => request.path)
        .sort(),
    ).toEqual([
      `${prefix}/check-runs/22/annotations?per_page=100`,
      `${prefix}/check-runs/33/annotations?per_page=100`,
    ]);
    expect(await resolveRestIdentity("opaque-check-two", "check")).toMatchObject({
      pr: 101,
      numericId: "33",
    });
  });

  it("requires recorded identity or caller scope instead of decoding opaque check IDs", async () => {
    await serve((_request, response) => response.end("[]"));
    await expect(readRestCheckAnnotations("CR_unknown")).rejects.toThrow(
      "No recorded REST identity",
    );
    expect(wire.requests).toEqual([]);
  });
});
