import { describe, expect, it } from "vitest";
import { wire, serve, repo } from "../../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { recordThreadIdentity } from "../github/rest-identities.mts";
import { applyResolveOptions } from "./resolve.mts";

describe("ambiguous reply safety across adapters", () => {
  it("does not replay an ambiguous GraphQL write through REST and blocks the aliased reply after restart", async () => {
    await recordThreadIdentity(repo, 101, "PRRT_opaque", 11);
    await serve((request, response) => {
      expect(request.path).toBe("/graphql");
      response.statusCode = 503;
      response.end('{"message":"Service Unavailable"}');
    });
    const failed = await runWithGithubTransport("auto", () =>
      applyResolveOptions(101, repo, { replyThreadIds: ["PRRT_opaque"], dismissMessage: "Fixed." }),
    );
    expect(failed.repliedThreads).toEqual([]);
    expect(failed.unrepliedThreads).toEqual(["PRRT_opaque"]);
    expect(wire.requests).toHaveLength(1);
    await expect(
      runWithGithubTransport("rest", () =>
        applyResolveOptions(101, repo, {
          replyThreadIds: ["rest-thread-11"],
          dismissMessage: "Fixed.",
        }),
      ),
    ).rejects.toThrow("Previous GraphQL reply outcome is uncertain");
    expect(wire.requests).toHaveLength(1);
  });
});
