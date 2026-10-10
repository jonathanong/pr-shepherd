import { describe, expect, it } from "vitest";
import {
  wire,
  serve,
  repo,
  pull,
  prefix,
} from "../../../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../../github/transport.mts";
import { lookupUpperLayerTrunkConflict } from "./stack-trunk-conflict.mts";

const input = { owner: repo.owner, name: repo.name, pr: 102, headRef: "ccc333", trunk: "main" };
const stack = {
  id: 9876543,
  number: 42,
  node_id: "S_42",
  base: { ref: "main" },
  pull_requests: [{ number: 101 }, { number: 102 }],
};
async function topology(behindBy: number) {
  await serve((request, response) => {
    const path = request.path.split("?")[0];
    if (path === "/user") response.end('{"login":"author"}');
    else if (path === `${prefix}/pulls/101`) response.end(JSON.stringify(pull));
    else if (path === `${prefix}/pulls/102`)
      response.end(
        JSON.stringify({
          ...pull,
          number: 102,
          id: 100002,
          node_id: "PR_102",
          head: { ...pull.head, ref: "user-api", sha: "ccc333" },
          base: { ref: "user-model", sha: "aaa111" },
        }),
      );
    else if (path === `${prefix}/compare/user-model...ccc333`)
      response.end(JSON.stringify({ behind_by: behindBy }));
    else if (path === `${prefix}/stacks`) response.end(JSON.stringify([stack]));
    else if (path === `${prefix}/stacks/42`) response.end(JSON.stringify(stack));
    else {
      response.statusCode = 404;
      response.end("{}");
    }
  });
}
describe("REST upper-layer conflict routing", () => {
  it("selects the bottom open layer when an upper layer contains its parent", async () => {
    await topology(0);
    expect(
      await runWithGithubTransport("rest", () => lookupUpperLayerTrunkConflict(input)),
    ).toEqual({ trunk: "main", bottomPr: 101 });
    expect(wire.requests.some((request) => request.path === "/graphql")).toBe(false);
    expect(wire.requests).toContainEqual({
      method: "GET",
      path: `${prefix}/compare/user-model...ccc333`,
      body: {},
    });
  });
  it("keeps the parent rebase target when the upper layer remains behind its parent", async () => {
    await topology(3);
    expect(
      await runWithGithubTransport("rest", () => lookupUpperLayerTrunkConflict(input)),
    ).toBeUndefined();
  });
});
