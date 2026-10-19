import { describe, expect, it } from "vitest";
import {
  repo,
  prefix,
  etagResponses as log,
} from "../test-helpers/github/rest-read.test-support.mts";
import {
  IDLE_PR_CONFIG,
  IDLE_PR_DETECTORS,
  idlePrState,
  serveIdlePr,
  type IdlePrState,
} from "../test-helpers/github/graphql-idle-pr.test-support.mts";
import { freshLoadConfig, writeRc } from "../test-helpers/config/load-test-support.mts";
import { runIterate } from "../src/commands/iterate/index.mts";
import { runWithGithubTransport } from "../src/github/transport.mts";

/**
 * Issue #614 end to end: an idle GraphQL wait (CI finished, a Copilot review requested) whose
 * `ci` check is re-run while the aggregate rollup and suite still read SUCCESS, so the
 * first-page fingerprint is unchanged. Only the idle wait detectors see the rerun.
 */
const tick = (fingerprintCache = true) =>
  runWithGithubTransport("graphql", async () => {
    log.length = 0;
    return runIterate({
      prNumber: 101,
      targetRepository: repo,
      format: "json",
      readyDelaySeconds: 0,
      stallTimeoutSeconds: 0,
      noAutoMarkReady: true,
      fingerprintCache,
    });
  });

const charged = () =>
  log.filter((entry) => entry.status !== 304).map((entry) => entry.path.split("?")[0]);

async function enterIdleWait(state: IdlePrState) {
  writeRc(IDLE_PR_CONFIG);
  await freshLoadConfig();
  await serveIdlePr(state);
  expect((await tick(false)).action).toBe("wait");
  expect(charged()).toEqual(["/graphql"]);
}

describe("GraphQL idle wait: a check rerun behind an unchanged fingerprint", () => {
  it("seeds the detectors beside a full snapshot, then a 304 tick replays it for free", async () => {
    await enterIdleWait(idlePrState());
    const seeding = await tick();
    expect(seeding).toMatchObject({ action: "wait", summary: { inProgress: 0 } });
    expect(seeding.fingerprintReused).toBeUndefined();
    expect(charged()).toEqual([...IDLE_PR_DETECTORS, "/graphql"]);

    const replay = await tick();
    expect(replay).toMatchObject({ action: "wait", fingerprintReused: true });
    expect(charged()).toEqual([]);
  });

  it("does not seed the detectors beside a report that predates a rerun", async () => {
    const state = idlePrState();
    await enterIdleWait(state);
    state.rerun = true;
    const seeding = await tick();
    expect(seeding).toMatchObject({ action: "wait", summary: { inProgress: 1 } });
    expect(seeding.fingerprintReused).toBeUndefined();
    expect((await tick()).summary.inProgress).toBe(1);
  });

  it("reports a rerun the detectors saw, and later 304 ticks keep reporting it", async () => {
    const state = idlePrState();
    await enterIdleWait(state);
    await tick();
    expect((await tick()).fingerprintReused).toBe(true);

    state.rerun = true;
    const rerun = await tick();
    expect(charged()).toEqual([`${prefix}/commits/aaa111/check-runs`, "/graphql"]);
    expect(rerun).toMatchObject({ action: "wait", summary: { inProgress: 1 } });
    expect(rerun.fingerprintReused).toBeUndefined();

    for (let i = 0; i < 2; i++) expect((await tick()).summary.inProgress).toBe(1);
  });
});
