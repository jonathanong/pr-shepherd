/**
 * End-to-end snapshots of `apply review` results for the eval suite. `index.test.mts` drives
 * `iterate` only; the review-mutation states below happen after the agent runs the printed
 * `apply review:` command, so evals/ embeds them as the prior turn of a transcript.
 *
 * Each scenario drives the real REST mutation path (`applyResolveOptions` under the REST
 * transport) against a local GitHub wire, then renders it the way `pr-shepherd apply review`
 * prints it (`formatMutateResult` for text, the raw result for JSON; see `src/cli-parser.mts`).
 * The exit code follows the same mapping and is recorded alongside the text snapshot.
 */
import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "../test-helpers/github/rest-read.test-support.mts";
import { runWithGithubTransport } from "../src/github/transport.mts";
import { applyResolveOptions, type ResolveResult } from "../src/comments/resolve.mts";
import { formatMutateResult } from "../src/cli/formatters.mts";
import { EXIT } from "../src/exit-codes.mts";

const snapshotsDir = fileURLToPath(new URL("./snapshots/", import.meta.url));
const repo = { owner: "owner", name: "repo" };

/** Mirrors the exit-code mapping in `src/cli-parser.mts` for `apply review`. */
function exitCodeFor(result: ResolveResult): number {
  if (result.sessionRefusal) return EXIT.NOPERM;
  if (result.errors.length > 0) return result.rateLimit ? EXIT.TEMPFAIL : EXIT.UNAVAILABLE;
  return 0;
}

async function snapshot(name: string, result: ResolveResult, expectedExitCode: number) {
  const exitCode = exitCodeFor(result);
  expect(exitCode).toBe(expectedExitCode);
  await expect(`${formatMutateResult(result)}\n\n[exit code ${exitCode}]\n`).toMatchFileSnapshot(
    join(snapshotsDir, name, "output.text.md"),
  );
  await expect(`${JSON.stringify(result, null, 2)}\n`).toMatchFileSnapshot(
    join(snapshotsDir, name, "output.json"),
  );
}

const reply = (ids: string[]) =>
  runWithGithubTransport("rest", () =>
    applyResolveOptions(42, repo, {
      replyThreadIds: ids,
      dismissMessage: "Renamed the variable.",
    }),
  );

describe("apply review snapshots", () => {
  // The prior turn of fixture 136-fix-code-denied-reply-one-look-skip.
  it("apply-review-denied-reply: GitHub denies the reply", async () => {
    await serve((request, response) => {
      if (request.path === "/user") response.end('{"login":"agent"}');
      else if (request.method === "POST") {
        response.statusCode = 403;
        response.end('{"message":"Resource not accessible by integration"}');
      } else response.end("[]");
    });
    const result = await reply(["rest-thread-11"]);
    expect(result.repliedThreads).toEqual([]);
    await snapshot("apply-review-denied-reply", result, EXIT.UNAVAILABLE);
  });

  it("apply-review-session-refusal: the cloud proxy refuses the session", async () => {
    vi.stubEnv("CLAUDE_CODE_REMOTE", "true");
    await serve((request, response) => {
      if (request.path === "/user") response.end('{"login":"agent"}');
      else if (request.method === "POST") {
        response.statusCode = 403;
        response.end(
          JSON.stringify({
            message:
              'GitHub access to this repository is not enabled for this session. Use add_repo to request access. If add_repo answers that read access is already available and you need GitHub API or write access, call add_repo again with access:"push".',
            documentation_url: "https://docs.anthropic.com/en/docs/claude-code/github-actions",
          }),
        );
      } else response.end("[]");
    });
    const result = await reply(["rest-thread-11", "rest-thread-12"]);
    expect(result.sessionRefusal).toBeTruthy();
    await snapshot("apply-review-session-refusal", result, EXIT.NOPERM);
  });
});
