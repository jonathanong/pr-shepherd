import { describe, expect, it } from "vitest";
import {
  wire,
  serve,
  pull,
  repo,
  prefix,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { readStackTopology } from "./stack-read.mts";
import { runWithGithubTransport } from "./transport.mts";

// Shape from GitHub's official REST stacks list/get examples: ordered pull_requests, base.ref.
const stack = {
  id: 9876543,
  number: 42,
  node_id: "S_42",
  base: { ref: "main" },
  pull_requests: [{ number: 101 }, { number: 102 }],
  open: true,
};
describe("official REST native stacks", () => {
  it("reads ordered members and checks topology stability through the named adapter", async () => {
    await serve((request, response) => {
      const path = request.path.split("?")[0];
      if (path === `${prefix}/stacks`) response.end(JSON.stringify([stack]));
      else if (path === `${prefix}/stacks/42`) response.end(JSON.stringify(stack));
      else if (path === `${prefix}/pulls/101`) response.end(JSON.stringify(pull));
      else if (path === `${prefix}/pulls/102`)
        response.end(
          JSON.stringify({
            ...pull,
            id: 100002,
            node_id: "PR_102",
            number: 102,
            head: { ...pull.head, ref: "user-api", sha: "ccc333" },
            base: { ref: "user-model", sha: "aaa111" },
          }),
        );
      else {
        response.statusCode = 404;
        response.end("{}");
      }
    });
    const result = await runWithGithubTransport("rest", () => readStackTopology(102, repo));
    expect(result).toMatchObject({
      stackNumber: 42,
      stackSize: 2,
      ordered: [
        { number: 101, headRefName: "user-model", baseRefName: "main" },
        { number: 102, headRefName: "user-api", baseRefName: "user-model", baseRefOid: "aaa111" },
      ],
    });
    expect(result).not.toHaveProperty("viewerCanAdminister");
    expect(
      wire.requests
        .filter((request) => request.path.startsWith(`${prefix}/stacks?`))
        .every((request) => request.path.includes("pull_request=102")),
    ).toBe(true);
    expect(wire.requests.some((request) => request.path === "/graphql")).toBe(false);
  });
  it("fails when the official stack membership changes during the read", async () => {
    let details = 0;
    await serve((request, response) => {
      const path = request.path.split("?")[0];
      if (path === `${prefix}/stacks`) response.end(JSON.stringify([stack]));
      else if (path === `${prefix}/stacks/42`)
        response.end(
          JSON.stringify({
            ...stack,
            pull_requests: ++details === 1 ? stack.pull_requests : [{ number: 102 }],
          }),
        );
      else {
        const number = Number(path?.split("/").at(-1));
        response.end(JSON.stringify({ ...pull, number, node_id: `PR_${number}` }));
      }
    });
    await expect(
      runWithGithubTransport("rest", () => readStackTopology(102, repo)),
    ).rejects.toThrow("changed during topology");
  });
  it("rejects duplicate stack members instead of deduplicating an incomplete stack", async () => {
    await serve((request, response) =>
      response.end(
        JSON.stringify(
          request.path.split("?")[0] === `${prefix}/stacks`
            ? [stack]
            : { ...stack, pull_requests: [{ number: 101 }, { number: 101 }] },
        ),
      ),
    );
    await expect(
      runWithGithubTransport("rest", () => readStackTopology(101, repo)),
    ).rejects.toThrow("repeated member");
  });
});
