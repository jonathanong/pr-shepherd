import { describe, expect, it } from "vitest";
import {
  repo,
  prefix,
  etagResponses as log,
} from "../../test-helpers/github/rest-read.test-support.mts";
import {
  IDLE_PR_CONFIG,
  IDLE_PR_DETECTORS,
  idlePrState,
  serveIdlePr,
} from "../../test-helpers/github/graphql-idle-pr.test-support.mts";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";
import { runCheck } from "../commands/check.mts";
import { runWithGithubTransport } from "./transport.mts";

/**
 * Issue #614: a wait detector that saw a change must not let the same tick reuse the cached
 * report through an unchanged first-page fingerprint, nor record its digest beside that report
 * so a later all-304 tick replays it. Drives the real `runScopedCheck` decision path.
 */
const tick = (fingerprintCache: boolean) =>
  runWithGithubTransport("graphql", async () => {
    log.length = 0;
    return runCheck({ prNumber: 101, targetRepository: repo, format: "json", fingerprintCache });
  });

const charged = () =>
  log.filter((entry) => entry.status !== 304).map((entry) => entry.path.split("?")[0]);

const running = (report: Awaited<ReturnType<typeof tick>>) =>
  report.checks.inProgress.map((check) => check.name);

describe("GraphQL idle wait detectors beside an unchanged aggregate fingerprint", () => {
  it("takes a full snapshot while seeding the detectors, then replays it for free", async () => {
    writeRc(IDLE_PR_CONFIG);
    await freshLoadConfig();
    await serveIdlePr(idlePrState());
    await tick(false);
    const seeding = await tick(true);
    expect(seeding.fingerprintReused).toBeUndefined();
    expect(charged()).toEqual([...IDLE_PR_DETECTORS, "/graphql"]);
    const replay = await tick(true);
    expect(replay.fingerprintReused).toBe(true);
    expect(charged()).toEqual([]);
  });

  it("does not reuse a report that predates a rerun begun before the seeding tick", async () => {
    writeRc(IDLE_PR_CONFIG);
    await freshLoadConfig();
    const state = idlePrState();
    await serveIdlePr(state);
    await tick(false);
    state.rerun = true;
    const seeding = await tick(true);
    expect(seeding.fingerprintReused).toBeUndefined();
    expect(running(seeding)).toEqual(["ci"]);
    expect(running(await tick(true))).toEqual(["ci"]);
  });

  it("takes a fresh snapshot when the latest check run changed, and keeps it next tick", async () => {
    writeRc(IDLE_PR_CONFIG);
    await freshLoadConfig();
    const state = idlePrState();
    await serveIdlePr(state);
    await tick(false);
    await tick(true);
    expect((await tick(true)).fingerprintReused).toBe(true);

    state.rerun = true;
    const changed = await tick(true);
    expect(charged()).toEqual([`${prefix}/commits/aaa111/check-runs`, "/graphql"]);
    expect(changed.fingerprintReused).toBeUndefined();
    expect(running(changed)).toEqual(["ci"]);

    const next = await tick(true);
    expect(running(next)).toEqual(["ci"]);
  });
});
