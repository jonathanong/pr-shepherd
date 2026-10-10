import { describe, expect, it } from "vitest";
import {
  wire,
  serve,
  repo,
  prefix,
  comment,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { applyResolveOptions } from "./resolve.mts";
import { addPrShepherdMarker } from "./marker.mts";

const opts = { replyThreadIds: ["rest-thread-11"], dismissMessage: "Fixed." };
const apply = () => runWithGithubTransport("rest", () => applyResolveOptions(101, repo, opts));
describe("REST reply response recovery", () => {
  it("reconciles a committed reply after a lost response and sends it only once", async () => {
    let created = false;
    await serve((request, response) => {
      if (request.path === "/user") response.end('{"login":"agent"}');
      else if (request.method === "POST") {
        created = true;
        response.destroy();
      } else
        response.end(
          JSON.stringify([
            comment(11),
            ...(created
              ? [
                  {
                    ...comment(12, 11),
                    body: addPrShepherdMarker("Fixed."),
                    user: { login: "agent", type: "User" },
                  },
                ]
              : []),
          ]),
        );
    });
    const result = await apply();
    expect(result).toMatchObject({ repliedThreads: ["rest-thread-11"], errors: [] });
    expect(wire.requests.filter((request) => request.method === "POST")).toHaveLength(1);
    expect(wire.requests.some((request) => request.path === "/graphql")).toBe(false);
  });
  it("persists an uncertain write across a new transport scope and recovers without a second reply", async () => {
    let committed = false;
    let visible = false;
    await serve((request, response) => {
      if (request.path === "/user") response.end('{"login":"agent"}');
      else if (request.method === "POST") {
        committed = true;
        response.destroy();
      } else
        response.end(
          JSON.stringify([
            comment(11),
            ...(committed && visible
              ? [
                  {
                    ...comment(12, 11),
                    body: addPrShepherdMarker("Fixed."),
                    user: { login: "agent", type: "User" },
                  },
                ]
              : []),
          ]),
        );
    });
    const first = await apply();
    expect(first.repliedThreads).toEqual([]);
    expect(first.unrepliedThreads).toEqual(["rest-thread-11"]);
    visible = true;
    const resumed = await apply();
    expect(resumed).toMatchObject({ repliedThreads: ["rest-thread-11"], errors: [] });
    expect(wire.requests.filter((request) => request.method === "POST")).toEqual([
      {
        method: "POST",
        path: `${prefix}/pulls/101/comments/11/replies`,
        body: { body: addPrShepherdMarker("Fixed.") },
      },
    ]);
  });
  it("keeps an uncertain reply pending when exact viewer identity is unavailable", async () => {
    await serve((request, response) => {
      if (request.path === "/user") {
        response.statusCode = 403;
        response.end('{"message":"Resource not accessible by integration"}');
      } else if (request.method === "POST") response.destroy();
      else response.end(JSON.stringify([comment(11)]));
    });
    expect((await apply()).unrepliedThreads).toEqual(["rest-thread-11"]);
    const second = await apply();
    expect(second.repliedThreads).toEqual([]);
    expect(second.errors).toEqual([expect.stringContaining("Previous reply outcome is uncertain")]);
    expect(wire.requests.filter((request) => request.method === "POST")).toHaveLength(1);
  });
});
