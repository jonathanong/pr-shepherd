import { afterEach, beforeEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { githubWire } from "./transport-wire.mts";
import { _resetTokenCache } from "../../src/github/http.mts";
export let wire: Awaited<ReturnType<typeof githubWire>>;
let directory: string;
export const repo = { owner: "octocat", name: "hello-world" };
export const prefix = "/repos/octocat/hello-world";
export const comment = (id: number, root?: number) => ({
  id,
  node_id: `PRRC_${id}`,
  body: `feedback ${id}`,
  html_url: `https://github.com/octocat/hello-world/pull/101#discussion_r${id}`,
  created_at: "2026-10-09T00:00:00Z",
  updated_at: "2026-10-09T00:00:00Z",
  user: { login: "reviewer", type: "User" },
  author_association: "MEMBER",
  path: "src/index.mts",
  line: 5,
  start_line: null,
  ...(root !== undefined && { in_reply_to_id: root }),
});
export const pull = {
  id: 100001,
  node_id: "PR_101",
  number: 101,
  title: "Add user model",
  body: "PR body",
  html_url: "https://github.com/octocat/hello-world/pull/101",
  state: "open",
  merged_at: null,
  draft: false,
  mergeable: true,
  mergeable_state: "clean",
  updated_at: "2026-10-09T00:00:00Z",
  user: { login: "author", type: "User" },
  head: { ref: "user-model", sha: "aaa111", repo: { full_name: "octocat/hello-world" } },
  base: { ref: "main", sha: "bbb222" },
  requested_reviewers: [],
  requested_teams: [],
};

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "pr-shepherd-rest-read-"));
  vi.stubEnv("PR_SHEPHERD_STATE_DIR", directory);
  vi.stubEnv("PR_SHEPHERD_LOG_DISABLED", "1");
  vi.stubEnv("GH_TOKEN", "test-token");
  vi.stubEnv("CLAUDE_CODE_REMOTE", "");
  vi.stubEnv("HTTPS_PROXY", "");
  vi.stubEnv("HTTP_PROXY", "");
  _resetTokenCache();
  conditionalEtags = false;
  withoutEtag = () => false;
  etagResponses.length = 0;
});
afterEach(async () => {
  if (wire) await wire.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
let conditionalEtags = false;
let withoutEtag: (path: string) => boolean = () => false;
/** Wire responses recorded by `serveWithEtags`; a charged request is any entry that is not 304. */
export const etagResponses: Array<{ status: number; path: string }> = [];
/**
 * Make the next `serve` answer like GitHub's conditional reads: every 200 GET carries a
 * body-hash ETag and a matching `If-None-Match` gets a bodiless 304. Paths matched by
 * `noEtag` answer like a route that sends no validator (always a charged 200).
 */
export function serveWithEtags(noEtag?: (path: string) => boolean): void {
  conditionalEtags = true;
  withoutEtag = noEtag ?? (() => false);
}
export async function serve(reply: Parameters<typeof githubWire>[0]) {
  wire = await githubWire(conditionalEtags ? withEtags(reply) : reply);
  vi.stubGlobal("fetch", wire.fetch);
}
function withEtags(reply: Parameters<typeof githubWire>[0]): Parameters<typeof githubWire>[0] {
  return (request, response) => {
    const end = response.end.bind(response) as (body?: string) => void;
    (response as unknown as { end: (body?: string) => void }).end = (body?: string) => {
      if (
        response.statusCode === 200 &&
        request.method === "GET" &&
        !withoutEtag(request.path.split("?")[0]!)
      ) {
        const etag = `"${createHash("sha256").update(String(body)).digest("hex").slice(0, 16)}"`;
        response.setHeader("etag", etag);
        if (request.headers?.["if-none-match"] === etag) {
          response.statusCode = 304;
          etagResponses.push({ status: 304, path: request.path });
          return end();
        }
      }
      etagResponses.push({ status: response.statusCode, path: request.path });
      return end(body);
    };
    reply(request, response);
  };
}
export function nextLink(path: string, page: number) {
  return `<https://api.github.com${path}?per_page=100&page=${page}>; rel="next"`;
}
