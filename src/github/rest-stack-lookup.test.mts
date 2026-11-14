import { describe, expect, it } from "vitest";
import { serve, wire, repo, prefix } from "../../test-helpers/github/rest-read.test-support.mts";
import { readRestStackByNumber, restPullExists } from "./rest-stack-read.mts";
import { runWithGithubTransport } from "./transport.mts";

const stack = {
  id: 9876543,
  number: 42,
  node_id: "S_42",
  base: { ref: "main" },
  pull_requests: [{ number: 101 }, { number: 102 }],
  open: true,
};

function reply(status: number, body: unknown) {
  return serve((_request, response) => {
    response.statusCode = status;
    response.end(JSON.stringify(body));
  });
}

describe("REST stack and pull request lookups for stack refs", () => {
  it("reads a native stack by its number", async () => {
    await reply(200, stack);
    const read = await runWithGithubTransport("rest", () => readRestStackByNumber(42, repo));
    expect(read).toEqual({ number: 42, members: [101, 102] });
    expect(wire.requests.map((request) => request.path)).toEqual([`${prefix}/stacks/42`]);
  });

  it("reports a missing stack as null and rethrows any other failure", async () => {
    await reply(404, { message: "Not Found" });
    expect(await runWithGithubTransport("rest", () => readRestStackByNumber(7, repo))).toBeNull();
    await wire.close();
    await reply(500, { message: "boom" });
    await expect(
      runWithGithubTransport("rest", () => readRestStackByNumber(7, repo)),
    ).rejects.toThrow();
  });

  it("rejects a malformed stack body", async () => {
    await reply(200, { number: 42, pull_requests: "nope" });
    await expect(
      runWithGithubTransport("rest", () => readRestStackByNumber(42, repo)),
    ).rejects.toThrow();
  });

  it("tells a pull request from a number GitHub does not have", async () => {
    await reply(200, { number: 5 });
    expect(await runWithGithubTransport("rest", () => restPullExists(5, repo))).toBe(true);
    expect(wire.requests.map((request) => request.path)).toEqual([`${prefix}/pulls/5`]);
    await wire.close();
    await reply(404, { message: "Not Found" });
    expect(await runWithGithubTransport("rest", () => restPullExists(5, repo))).toBe(false);
    await wire.close();
    await reply(500, { message: "boom" });
    await expect(runWithGithubTransport("rest", () => restPullExists(5, repo))).rejects.toThrow();
  });
});
