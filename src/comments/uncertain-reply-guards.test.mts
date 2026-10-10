import { describe, expect, it } from "vitest";
import { readFile, unlink } from "node:fs/promises";
import { wire, serve, repo, comment } from "../../test-helpers/github/rest-read.test-support.mts";
import { applyResolveOptions } from "./resolve.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { rememberUncertainReplies } from "./uncertain-replies.mts";
import { recordThreadIdentity } from "../github/rest-identities.mts";
const message = "Fixed.";
const context = { repo, pr: 101 };
const apply = (transport: "rest" | "graphql", id: string, text = message) =>
  runWithGithubTransport(transport, () =>
    applyResolveOptions(101, repo, { replyThreadIds: [id], dismissMessage: text }),
  );
const files = (error: Error) =>
  [...error.message.matchAll(/'([^']+\.json)'/g)].map((match) => match[1]!);

describe("unmapped pending reply intent guards", () => {
  it("blocks an unproven REST alias after unavailable prewrite evidence and permits unrelated messages", async () => {
    await serve((request, response) => {
      if (request.path === "/graphql") {
        if (String(request.body.query).includes("ReplyRecoveryEvidence"))
          return response.end('{"data":null,"errors":[{"message":"Reader unavailable"}]}');
        return response.end(
          '{"data":null,"errors":[{"message":"engine crashed","type":"INTERNAL"}]}',
        );
      }
      if (request.path === "/user") return response.end('{"login":"agent"}');
      if (request.method === "POST") return response.end('{"id":99}');
      return response.end(JSON.stringify([comment(11)]));
    });
    expect(await apply("graphql", "PRRT_opaque")).toMatchObject({
      repliedThreads: [],
      unrepliedThreads: ["PRRT_opaque"],
    });
    const error = await apply("rest", "rest-thread-11").catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("REST identity is unknown");
    expect(files(error as Error)).toHaveLength(2);
    expect(await apply("rest", "rest-thread-11", "Different disposition.")).toMatchObject({
      repliedThreads: ["rest-thread-11"],
      errors: [],
    });
    expect(
      wire.requests.filter(({ method, path }) => method === "POST" && path !== "/graphql"),
    ).toHaveLength(1);
  });

  it("clears only one original unresolved intent after caller verification, preserving another", async () => {
    await rememberUncertainReplies(context, ["PRRT_first", "PRRT_second"], message);
    await serve((request, response) => {
      if (request.path === "/user") response.end('{"login":"agent"}');
      else response.end(JSON.stringify([comment(11)]));
    });
    const error = (await apply("rest", "rest-thread-11").catch((value: unknown) => value)) as Error;
    const selected = files(error);
    expect(selected).toHaveLength(2);
    const originals = await Promise.all(
      selected.map(async (path) => JSON.parse(await readFile(path, "utf8")) as { id: string }),
    );
    expect(new Set(originals.map(({ id }) => id)).size).toBe(1);
    for (const path of selected) await unlink(path);
    const next = (await apply("rest", "rest-thread-11").catch((value: unknown) => value)) as Error;
    expect(files(next)).toHaveLength(2);
    expect(next.message).not.toContain(originals[0]!.id);
  });

  it("moves a mapped intent to its canonical marker and removes only its guard", async () => {
    await rememberUncertainReplies(context, ["PRRT_opaque"], message);
    await recordThreadIdentity(repo, 101, "PRRT_opaque", 11);
    await serve((request, response) => {
      if (request.path === "/user") response.end('{"login":"agent"}');
      else response.end(JSON.stringify([comment(11)]));
    });
    const error = (await apply("rest", "rest-thread-11").catch((value: unknown) => value)) as Error;
    expect(error.message).toContain("verify whether the previous reply was delivered");
    expect(files(error)).toHaveLength(2);
    expect(files(error).every((path) => path.includes("uncertain-replies"))).toBe(true);
    expect(wire.requests.filter(({ method }) => method === "POST")).toHaveLength(0);
  });
});
