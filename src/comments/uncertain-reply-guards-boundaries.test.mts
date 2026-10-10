import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { repo, serve } from "../../test-helpers/github/rest-read.test-support.mts";
import { resolvePrStatePath } from "../state/base.mts";
import { recordThreadIdentity } from "../github/rest-identities.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { prepareUnmappedIntents, rememberUnmappedIntent } from "./uncertain-reply-guards.mts";
const context = { repo, pr: 101 };
const message = "Fixed.";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const directory = () =>
  resolvePrStatePath(
    { owner: repo.owner, repo: repo.name, pr: 101 },
    "unmapped-reply-intents",
    hash(message),
  );
const missing = async () => [join(directory(), "missing.json")];
const prepare = () => prepareUnmappedIntents(context, ["rest-thread-11"], message, missing);

describe("pending reply guard evidence boundaries", () => {
  it("fails closed when the guard directory is corrupted", async () => {
    await mkdir(join(directory(), ".."), { recursive: true });
    await writeFile(directory(), "invalid");
    await expect(prepare()).rejects.toMatchObject({ code: "ENOTDIR" });
  });

  it("bounds unresolved intent inspection", async () => {
    await mkdir(directory(), { recursive: true });
    await Promise.all(
      Array.from({ length: 1001 }, (_, index) =>
        writeFile(join(directory(), `${index}.json`), "{}"),
      ),
    );
    await expect(prepare()).rejects.toThrow("Too many unresolved reply intents");
  });

  it("rejects an intent that belongs to another message", async () => {
    await mkdir(directory(), { recursive: true });
    await writeFile(
      join(directory(), "guard.json"),
      JSON.stringify({ id: "PRRT_opaque", message: "Other." }),
    );
    await expect(prepare()).rejects.toThrow("Invalid unresolved reply intent");
  });

  it("reconciles an identity via a named GraphQL read before migrating its guard", async () => {
    await rememberUnmappedIntent(context, "PRRT_opaque", message);
    await serve((_, response) =>
      response.end(
        JSON.stringify({
          data: {
            viewer: { login: "agent" },
            nodes: [
              {
                id: "PRRT_opaque",
                pullRequest: { number: 101, repository: { nameWithOwner: "octocat/hello-world" } },
                comments: {
                  totalCount: 1,
                  pageInfo: { hasNextPage: false, endCursor: null },
                  nodes: [
                    { id: "root", databaseId: 11, body: "root", author: { login: "reviewer" } },
                  ],
                },
              },
            ],
          },
        }),
      ),
    );
    await runWithGithubTransport("graphql", prepare);
    // The absent intent marker was already removed by targeted recovery; no success is invented.
    await prepare();
  });

  it("fails closed on unreadable marker data instead of losing the original pending outcome", async () => {
    await serve((_, response) => response.end("{}"));
    await rememberUnmappedIntent(context, "PRRT_opaque", message);
    await recordThreadIdentity(repo, 101, "PRRT_opaque", 11);
    // Skip a removed first alias, then encounter a corrupted second alias after mapping.
    await expect(
      prepareUnmappedIntents(context, [], message, async () => [
        join(directory(), "absent.json"),
        directory(),
      ]),
    ).rejects.toMatchObject({ code: "EISDIR" });
  });
});
