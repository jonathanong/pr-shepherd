import { describe, expect, it } from "vitest";
import { serve, wire, prefix, pull } from "../../test-helpers/github/rest-read.test-support.mts";
import { loadMergeTargetStatus } from "./merge-target-rules.mts";
import { runWithGithubTransport } from "./transport.mts";

describe("REST merge targets after a merged stack prefix", () => {
  async function stackServer(mergedPrefix = true) {
    const stack = {
      number: 42,
      node_id: "S_42",
      base: { ref: "main" },
      pull_requests: [{ number: 101 }, { number: 102 }, { number: 103 }],
    };
    await serve((request, response) => {
      const path = request.path.split("?")[0];
      if (path === "/user") response.end('{"login":"author"}');
      else if (path === `${prefix}/stacks`) response.end(JSON.stringify([stack]));
      else if (path === `${prefix}/stacks/42`) response.end(JSON.stringify(stack));
      else if (path?.includes("/pulls/")) {
        const number = Number(path.split("/").at(-1));
        response.end(
          JSON.stringify({
            ...pull,
            id: 100000 + number,
            node_id: `PR_${number}`,
            number,
            ...(number === 101 && {
              state: "closed",
              merged_at: mergedPrefix ? "2026-10-09T00:00:00Z" : null,
            }),
            head: {
              ...pull.head,
              ref: number === 101 ? "user-model" : number === 102 ? "user-api" : "user-ui",
              sha: number === 101 ? "aaa111" : number === 102 ? "ccc333" : "ddd444",
            },
            base: {
              ref: number === 101 ? "main" : number === 102 ? "user-model" : "user-api",
              sha: number === 101 ? "bbb222" : number === 102 ? "aaa111" : "ccc333",
            },
          }),
        );
      } else if (path?.endsWith("/protection"))
        response.end(
          '{"required_pull_request_reviews":null,"required_status_checks":{"contexts":["trunk-required"],"strict":true}}',
        );
      else if (path?.includes("/compare/")) response.end('{"behind_by":7}');
      else response.end("[]");
    });
  }
  const input = {
    owner: "octocat",
    name: "hello-world",
    pr: 103,
    baseRefName: "user-api",
    headRefName: "user-ui",
    localContexts: ["upper-local"],
    stack: { baseRefName: "main" },
  };

  it.each([102, 103])("uses the verified bottom open OID for PR #%i", async (pr) => {
    await stackServer();
    const status = await runWithGithubTransport("rest", () =>
      loadMergeTargetStatus({ ...input, pr }),
    );
    expect({ ...status, trunkBehindBy: await status.trunkBehindBy?.() }).toEqual({
      contexts: ["trunk-required"],
      trunkBehindBy: 7,
      stackBottomPr: 102,
    });
    expect(wire.requests.filter((request) => request.path.includes("/compare/"))).toMatchObject([
      { path: `${prefix}/compare/main...ccc333` },
    ]);
    expect(wire.requests.some((request) => request.path === "/graphql")).toBe(false);
  });

  it("rejects a closed unmerged predecessor instead of designating its open descendant", async () => {
    await stackServer(false);
    await expect(
      runWithGithubTransport("rest", () => loadMergeTargetStatus(input)),
    ).rejects.toThrow("PR #101 in state CLOSED before open PR #102");
    expect(wire.requests.some((request) => request.path.includes("/compare/"))).toBe(false);
  });
});
