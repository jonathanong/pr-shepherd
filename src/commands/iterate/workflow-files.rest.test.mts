import { beforeEach, describe, expect, it } from "vitest";
import { serve, wire, prefix, repo } from "../../../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../../github/transport.mts";
import { clearWorkflowFileMemo, readWorkflowFiles } from "./workflow-files.mts";

const ci = { ref: "abc123", path: ".github/workflows/ci.yml", pinned: true };
const lint = { ref: "abc123", path: ".github/workflows/lint.yml", pinned: true };
const read = (requests: Array<typeof ci>) =>
  runWithGithubTransport("rest", () => readWorkflowFiles(repo, requests));

describe("readWorkflowFiles over REST", () => {
  beforeEach(() => clearWorkflowFileMemo());

  it("reads each file through the contents API at its ref and decodes base64", async () => {
    await serve((_request, response) =>
      response.end(
        JSON.stringify({
          type: "file",
          encoding: "base64",
          content: Buffer.from("concurrency:\n  cancel-in-progress: true\n").toString("base64"),
        }),
      ),
    );
    const result = await read([ci, lint]);
    expect(result.get("abc123:.github/workflows/ci.yml")).toEqual({
      text: "concurrency:\n  cancel-in-progress: true\n",
    });
    expect(wire.requests.map((request) => request.path).sort()).toEqual([
      `${prefix}/contents/.github/workflows/ci.yml?ref=abc123`,
      `${prefix}/contents/.github/workflows/lint.yml?ref=abc123`,
    ]);
  });

  it("reports the HTTP status of a file it cannot read", async () => {
    await serve((request, response) => {
      response.statusCode = request.path.includes("ci.yml") ? 404 : 403;
      response.end('{"message":"nope"}');
    });
    const result = await read([ci, lint]);
    expect(result.get("abc123:.github/workflows/ci.yml")).toEqual({ unreadable: "404" });
    expect(result.get("abc123:.github/workflows/lint.yml")).toEqual({ unreadable: "403" });
  });

  it("calls a file with no inline content (over 1 MB) truncated", async () => {
    await serve((_request, response) =>
      response.end(JSON.stringify({ type: "file", encoding: "none", content: "" })),
    );
    expect((await read([ci])).get("abc123:.github/workflows/ci.yml")).toEqual({
      unreadable: "truncated",
    });
  });

  it("switches to REST after a GraphQL cloud refusal in auto mode, and propagates it in graphql mode", async () => {
    await serve((request, response) => {
      if (request.path === "/graphql") {
        response.statusCode = 403;
        response.end('{"message":"GitHub GraphQL is not available from Claude Code sessions"}');
      } else {
        const content = Buffer.from("a: 1").toString("base64");
        response.end(JSON.stringify({ type: "file", encoding: "base64", content }));
      }
    });
    const auto = await runWithGithubTransport("auto", () => readWorkflowFiles(repo, [ci]));
    expect(auto.get("abc123:.github/workflows/ci.yml")).toEqual({ text: "a: 1" });
    clearWorkflowFileMemo();
    await expect(
      runWithGithubTransport("graphql", () => readWorkflowFiles(repo, [ci])),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("marks a malformed answer unreadable and propagates a rate limit", async () => {
    await serve((_request, response) => response.end("[]"));
    expect((await read([ci])).get("abc123:.github/workflows/ci.yml")).toEqual({
      unreadable: "200",
    });
    await wire.close();
    await serve((_request, response) => {
      response.statusCode = 429;
      response.setHeader("retry-after", "30");
      response.end('{"message":"You have exceeded a secondary rate limit"}');
    });
    await expect(read([ci])).rejects.toMatchObject({ status: 429 });
  });
});
