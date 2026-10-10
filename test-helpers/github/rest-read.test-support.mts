import { afterEach, beforeEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
});
afterEach(async () => {
  if (wire) await wire.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
export async function serve(reply: Parameters<typeof githubWire>[0]) {
  wire = await githubWire(reply);
  vi.stubGlobal("fetch", wire.fetch);
}
export function nextLink(path: string, page: number) {
  return `<https://api.github.com${path}?per_page=100&page=${page}>; rel="next"`;
}
