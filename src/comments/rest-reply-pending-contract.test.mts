import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import {
  wire,
  serve,
  repo,
  prefix,
  comment,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { resolvePrStatePath } from "../state/base.mts";
import { replyToThread } from "./rest-reply.mts";

const pr = 101;
const root = "11";
const body = "A reply with a stable body.";
const pendingPath = () => {
  const hash = createHash("sha256").update(`${root}\n${body}`).digest("hex");
  return resolvePrStatePath(
    { owner: repo.owner, repo: repo.name, pr },
    "pending-replies",
    `${hash}.json`,
  );
};

describe("REST pending reply safety", () => {
  it("rejects corrupt and structurally invalid pending records before sending a reply", async () => {
    const path = pendingPath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "not-json");
    await expect(replyToThread(repo, pr, root, body)).rejects.toThrow(
      "Cannot read pending REST reply; cannot safely retry",
    );
    await writeFile(path, JSON.stringify({ root, body, beforeIds: "not-an-array" }));
    await expect(replyToThread(repo, pr, root, body)).rejects.toThrow(
      "Invalid pending REST reply; cannot safely retry",
    );
  });

  it("keeps a successful response without an ID pending as uncertain", async () => {
    await serve((request, response) => {
      if (request.path === "/user") response.end('{"login":"agent"}');
      else if (request.method === "POST") response.end("{}");
      else response.end(JSON.stringify([comment(11)]));
    });
    await expect(replyToThread(repo, pr, root, body)).rejects.toThrow(
      "Reply returned no valid comment ID; outcome is uncertain",
    );
    await expect(replyToThread(repo, pr, root, body)).rejects.toThrow(
      "Previous reply outcome is uncertain",
    );
    expect(wire.requests.filter((request) => request.method === "POST")).toHaveLength(1);
  });

  it("clears a definitely rejected pending write so a later invocation can retry", async () => {
    await serve((request, response) => {
      if (request.path === "/user") response.end('{"login":"agent"}');
      else if (request.method === "POST") {
        response.statusCode = 422;
        response.end('{"message":"Validation Failed"}');
      } else response.end(JSON.stringify([comment(11)]));
    });
    await expect(replyToThread(repo, pr, root, body)).rejects.toThrow("422");
    await expect(replyToThread(repo, pr, root, body)).rejects.toThrow("422");
    expect(wire.requests.filter((request) => request.method === "POST")).toEqual([
      expect.objectContaining({ path: `${prefix}/pulls/101/comments/11/replies` }),
      expect.objectContaining({ path: `${prefix}/pulls/101/comments/11/replies` }),
    ]);
  });
});
