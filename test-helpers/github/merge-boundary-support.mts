import { afterEach, beforeEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mergeWire, mergeHead } from "./merge-wire.mts";
import { _resetTokenCache } from "../../src/github/http.mts";
import { _resetLogState } from "../../src/log/log-file.mts";
import { runWithGithubTransport } from "../../src/github/transport.mts";
import { runApplyMerge } from "../../src/commands/apply-merge.mts";

export let harness: Awaited<ReturnType<typeof mergeWire>>;
export let directory: string;
export const key = { owner: "owner", repo: "repo", pr: 1 };
export const input = {
  prNumber: 1,
  targetRepository: { owner: "owner", name: "repo" },
  requireSha: mergeHead,
  mergeAction: "direct_merge" as const,
  mergeMethod: "squash" as const,
};
export const apply = () => runWithGithubTransport("rest", () => runApplyMerge(input));
export const submissions = () => harness.wire.requests.filter(({ method }) => method === "PUT");

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "pr-shepherd-merge-boundary-"));
  harness = await mergeWire();
  for (const name of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
    "CLAUDE_CODE_REMOTE",
  ])
    vi.stubEnv(name, "");
  vi.stubEnv("GH_TOKEN", "test-token");
  vi.stubEnv("PR_SHEPHERD_LOG_DISABLED", "1");
  vi.stubEnv("PR_SHEPHERD_STATE_DIR", directory);
  vi.stubGlobal("fetch", harness.wire.fetch);
  _resetTokenCache();
  _resetLogState();
});
afterEach(async () => {
  await harness.wire.close();
  await rm(directory, { recursive: true, force: true });
  process.exitCode = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  _resetTokenCache();
});
