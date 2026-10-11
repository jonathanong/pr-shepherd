import { describe, expect, it, vi } from "vitest";
import {
  repo,
  prefix,
  etagResponses as log,
} from "../../test-helpers/github/rest-read.test-support.mts";
import {
  IDLE_PR_DETECTORS,
  idlePrState,
  serveIdlePr,
  type IdlePrState,
} from "../../test-helpers/github/graphql-idle-pr.test-support.mts";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";
import { runIterate } from "../commands/iterate/index.mts";
import { getGithubTransport, runWithGithubTransport } from "./transport.mts";

/**
 * Cost of an idle GraphQL wait (CI finished, waiting on a review), measured at the HTTP
 * boundary. The fake answers like GitHub's conditional reads, so a request is charged exactly
 * when it is not a 304: `/graphql` is one point, any other charged path is one core request.
 */
const tick = (fingerprintCache: boolean, mode: "graphql" | "auto" = "graphql") =>
  runWithGithubTransport(mode, async () => {
    log.length = 0;
    const report = await runIterate({
      prNumber: 101,
      targetRepository: repo,
      format: "json",
      readyDelaySeconds: 0,
      stallTimeoutSeconds: 0,
      noAutoMarkReady: true,
      fingerprintCache,
    });
    return { report, transport: getGithubTransport() };
  });

const charged = () =>
  log.filter((entry) => entry.status !== 304).map((entry) => entry.path.split("?")[0]);

/** Cold tick, then the seeding tick: detectors read cold beside one fingerprint-hit BatchPr. */
async function seed(state: IdlePrState) {
  await serveIdlePr(state);
  const cold = await tick(false);
  expect(cold.report.action).toBe("wait");
  expect(charged()).toEqual(["/graphql"]);
  const seeding = await tick(true);
  expect(seeding.report).toMatchObject({ action: "wait", fingerprintReused: true });
  expect(charged()).toEqual([...IDLE_PR_DETECTORS, "/graphql"]);
}

describe("GraphQL idle wait detectors", () => {
  it("charges nothing on an unchanged idle wait tick", async () => {
    await freshLoadConfig();
    await seed(idlePrState());
    for (let i = 0; i < 2; i++) {
      const next = await tick(true);
      expect(next.report).toMatchObject({ action: "wait", fingerprintReused: true });
      expect(charged()).toEqual([]);
      expect(log.filter((entry) => entry.status === 304)).toHaveLength(IDLE_PR_DETECTORS.length);
    }
  });

  it("reads the GraphQL snapshot when a detector changes, then reuses again", async () => {
    await freshLoadConfig();
    const state = idlePrState();
    await seed(state);
    state.reviews = [{ id: 1, node_id: "PRR_1", state: "COMMENTED", body: "" }];
    const changed = await tick(true);
    expect(changed.report.action).toBe("wait");
    expect(charged()).toEqual([`${prefix}/pulls/101/reviews`, "/graphql"]);
    const after = await tick(true);
    expect(after.report).toMatchObject({ action: "wait", fingerprintReused: true });
    expect(charged()).toEqual([]);
  });

  it("reconciles with GraphQL once the reconcile interval elapses", async () => {
    await freshLoadConfig();
    await seed(idlePrState());
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start + 900_000);
    const reconciled = await tick(true);
    expect(reconciled.report.action).toBe("wait");
    expect(charged()).toEqual(["/graphql"]);
    now.mockReturnValue(start + 900_001);
    await tick(true);
    expect(charged()).toEqual([]);
  });

  it("does not run detectors when reconcileSeconds is 0", async () => {
    writeRc("poll:\n  reconcileSeconds: 0\n");
    await freshLoadConfig();
    await serveIdlePr(idlePrState());
    await tick(false);
    for (let i = 0; i < 2; i++) {
      const next = await tick(true);
      expect(next.report).toMatchObject({ action: "wait", fingerprintReused: true });
      expect(charged()).toEqual(["/graphql"]);
    }
  });

  it("does not run detectors while a check is still running", async () => {
    await freshLoadConfig();
    await serveIdlePr({ ...idlePrState(), checkStatus: "IN_PROGRESS" });
    await tick(false);
    const next = await tick(true);
    expect(next.report).toMatchObject({ action: "wait", fingerprintReused: true });
    expect(charged()).toEqual(["/graphql"]);
  });

  it("falls back to the GraphQL snapshot, on the GraphQL transport, when a detector fails", async () => {
    await freshLoadConfig();
    const state = idlePrState();
    await seed(state);
    state.branchFailures = 1;
    const next = await tick(true, "auto");
    expect(next.transport).toBe("graphql");
    expect(next.report).toMatchObject({ action: "wait", fingerprintReused: true });
    expect(charged()).toEqual([`${prefix}/branches/main`, "/graphql"]);
  });

  it("aborts the tick on a detector's secondary rate limit", async () => {
    await freshLoadConfig();
    const state = idlePrState();
    await seed(state);
    state.branchThrottled = true;
    await expect(tick(true)).rejects.toThrow(/secondary rate limit/);
    expect(log.some((entry) => entry.path === "/graphql")).toBe(false);
  });
});
