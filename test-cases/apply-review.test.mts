/**
 * End-to-end snapshots of `apply review` results for the eval suite. `index.test.mts` drives
 * `iterate` only; the review-mutation states below happen after the agent runs the printed
 * `apply review:` command, so evals/ embeds them as the prior turn of a transcript.
 *
 * Each scenario drives the real REST mutation path (`applyResolveOptions` under the REST
 * transport) against a local GitHub wire, including the `--require-sha` preflight that the
 * replayed command passes, then renders it the way `pr-shepherd apply review`
 * prints it (`formatMutateResult` for text, the raw result for JSON; see `src/cli-parser.mts`).
 * The exit code comes from the CLI's own mapping (`applyReviewResultToExitCode`) and is recorded
 * alongside the text snapshot.
 */
import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";
import { pull, serve } from "../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../src/github/transport.mts";
import { applyResolveOptions, type ResolveResult } from "../src/comments/resolve.mts";
import { formatMutateResult } from "../src/cli/formatters.mts";
import { EXIT, applyReviewResultToExitCode } from "../src/exit-codes.mts";

const snapshotsDir = fileURLToPath(new URL("./snapshots/", import.meta.url));
const repo = { owner: "owner", name: "repo" };

async function snapshot(name: string, result: ResolveResult, expectedExitCode: number) {
  const exitCode = applyReviewResultToExitCode(result);
  expect(exitCode).toBe(expectedExitCode);
  await expect(`${formatMutateResult(result)}\n\n[exit code ${exitCode}]\n`).toMatchFileSnapshot(
    join(snapshotsDir, name, "output.text.md"),
  );
  await expect(`${JSON.stringify(result, null, 2)}\n`).toMatchFileSnapshot(
    join(snapshotsDir, name, "output.json"),
  );
}

// The `--require-sha` in the replayed command (evals/cases/deferred.mjs). The
// `waitForSha` preflight reads the pull before any mutation, so the wire serves it.
const PUSHED_SHA = "9f3c2ab61d4e0b8a7c5f3e2d1c0b9a8f7e6d5c4b";
const pull42 = {
  ...pull,
  number: 42,
  html_url: "https://github.com/owner/repo/pull/42",
  head: { ...pull.head, sha: PUSHED_SHA },
};

const reply = (ids: string[]) =>
  runWithGithubTransport("rest", () =>
    applyResolveOptions(42, repo, {
      replyThreadIds: ids,
      dismissMessage: "Renamed the variable.",
      requireSha: PUSHED_SHA,
    }),
  );

/** Serves the user and the pull at the pushed head; `post` answers every mutation. */
async function serveApply(post: (response: ServerResponse) => void): Promise<string[]> {
  const pullReads: string[] = [];
  await serve((request, response) => {
    if (request.path === "/user") response.end('{"login":"agent"}');
    else if (request.method === "GET" && request.path === "/repos/owner/repo/pulls/42") {
      pullReads.push(request.path);
      response.end(JSON.stringify(pull42));
    } else if (request.method === "POST") post(response);
    else response.end("[]");
  });
  return pullReads;
}

describe("apply review snapshots", () => {
  // The prior turn of fixture 140-fix-code-denied-reply-one-look-skip.
  it("apply-review-denied-reply: GitHub denies the reply", async () => {
    const pullReads = await serveApply((response) => {
      response.statusCode = 403;
      response.end('{"message":"Resource not accessible by integration"}');
    });
    const result = await reply(["rest-thread-11"]);
    expect(pullReads.length).toBeGreaterThan(0);
    expect(result.repliedThreads).toEqual([]);
    await snapshot("apply-review-denied-reply", result, EXIT.UNAVAILABLE);
  });

  // The same apply run in a Claude Code cloud session whose proxy grants read
  // access (the SHA preflight passes) but refuses the write.
  it("apply-review-session-refusal: the cloud proxy refuses the session", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    const pullReads = await serveApply((response) => {
      response.statusCode = 403;
      response.end(
        JSON.stringify({
          message:
            'GitHub access to this repository is not enabled for this session. Use add_repo to request access. If add_repo answers that read access is already available and you need GitHub API or write access, call add_repo again with access:"push".',
          documentation_url: "https://docs.anthropic.com/en/docs/claude-code/github-actions",
        }),
      );
    });
    const result = await reply(["rest-thread-11"]);
    expect(pullReads.length).toBeGreaterThan(0);
    expect(result.unrepliedThreads).toEqual(["rest-thread-11"]);
    await snapshot("apply-review-session-refusal", result, EXIT.NOPERM);
  });
});
