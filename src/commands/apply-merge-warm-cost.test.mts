import { describe, expect, it } from "vitest";
import {
  serve,
  repo,
  pull,
  prefix,
  serveWithEtags,
  etagResponses as log,
} from "../../test-helpers/github/rest-read.test-support.mts";
import { restIterateRoutes } from "../../test-helpers/github/rest-iterate-routes.test-support.mts";
import { freshLoadConfig } from "../../test-helpers/config/load-test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { runIterate } from "./iterate/index.mts";
import { runApplyMerge } from "./apply-merge.mts";

/**
 * Charged-request budget of the READY step on the REST transport, measured at the HTTP boundary
 * with a fake that answers like GitHub's conditional reads (a request is charged exactly when it
 * is not a 304). After the ready-delay countdown's warm READY tick, the tick that prints the
 * merge command charges nothing, and the printed `apply merge` charges only its merge write: its
 * pull and stack reads share the tick's ETag cache. evals/tokens/scenarios.mjs (`merge`,
 * `merge-queue`) charges these counts.
 */
const head = "a".repeat(40);

async function serveReadyPr(mergeQueue: boolean) {
  serveWithEtags();
  const routes = restIterateRoutes({ pending: false });
  await serve((request, response) => {
    const path = request.path.split("?")[0]!;
    if (path === `${prefix}/pulls/101`)
      response.end(JSON.stringify({ ...pull, head: { ...pull.head, sha: head } }));
    else if (path === `${prefix}/pulls`) response.end("[]");
    else if (path === "/user") response.end('{"login":"me"}');
    else if (path === `${prefix}/branches/main`)
      response.end(
        JSON.stringify({
          name: "main",
          commit: { sha: "bbb222" },
          protected: false,
          protection: { enabled: false },
        }),
      );
    else if (mergeQueue && path.includes("/rules/branches/"))
      response.end(
        JSON.stringify([
          { type: "merge_queue", ruleset_id: 1, parameters: { merge_method: "MERGE" } },
        ]),
      );
    else if (path === `${prefix}/pulls/101/merge-async` && request.method === "PUT") {
      const body = (request as { body?: Record<string, string> }).body ?? {};
      response.statusCode = 202;
      response.end(
        JSON.stringify({
          status: "pending",
          details: {
            message: "Merge request is in progress.",
            uuid: "630b9d5e-3f2a-4f7e-8b0c-2d5f9a8c1e42",
            merge_action: body.merge_action,
            ...(body.merge_method && { merge_method: body.merge_method }),
            expected_head_sha: body.sha,
            bypass_rules: false,
          },
        }),
      );
    } else void routes(request, response);
  });
}

const tick = () =>
  runWithGithubTransport("rest", () =>
    runIterate({
      prNumber: 101,
      targetRepository: repo,
      format: "json",
      readyDelaySeconds: 0,
      stallTimeoutSeconds: 0,
      merge: true,
    }),
  );

const charged = () =>
  log.filter((entry) => entry.status !== 304).map((entry) => entry.path.split("?")[0]);
const sent = () => log.map((entry) => entry.path.split("?")[0]);

describe("REST READY merge request budget", () => {
  it.each([false, true])(
    "charges only the merge write after a warm READY tick (merge queue: %s)",
    async (mergeQueue) => {
      await freshLoadConfig();
      await serveReadyPr(mergeQueue);
      await tick();
      log.length = 0;
      const ready = await tick();
      expect(ready).toMatchObject({ action: "merge", merge: { mode: "rest" } });
      expect(charged()).toEqual([]);

      log.length = 0;
      const argv = (ready as { merge: { command: { argv: string[] } } }).merge.command.argv;
      const flag = (name: string) => argv[argv.indexOf(name) + 1];
      const mergeAction = flag("--merge-action") as "direct_merge" | "merge_queue";
      expect(mergeAction).toBe(mergeQueue ? "merge_queue" : "direct_merge");
      const result = await runWithGithubTransport("rest", () =>
        runApplyMerge({
          prNumber: 101,
          targetRepository: repo,
          requireSha: flag("--require-sha")!,
          mergeAction,
          ...(argv.includes("--method") && {
            mergeMethod: flag("--method") as "merge" | "squash" | "rebase",
          }),
        }),
      );
      expect(result.status).toBe("pending");
      expect(sent()).toEqual([
        `${prefix}/pulls/101`,
        `${prefix}/stacks`,
        `${prefix}/pulls/101/merge-async`,
      ]);
      expect(charged()).toEqual([`${prefix}/pulls/101/merge-async`]);
    },
  );
});
