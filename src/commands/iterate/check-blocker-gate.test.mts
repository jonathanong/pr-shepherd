import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubRequestError } from "../../github/errors.mts";
import {
  readCheckBlockers,
  writeCheckBlocker,
  type CheckBlockerRef,
} from "../../state/check-blockers.mts";
import { pollRateLimitRetryAfterMs } from "../poll-quota.mts";

const { mockGraphql } = vi.hoisted(() => ({ mockGraphql: vi.fn() }));
vi.mock("../../github/client.mts", () => ({ graphql: mockGraphql }));

import { annotateBlockedWait, resolveCheckBlockerGate } from "./check-blocker-gate.mts";
import type { IterateResult } from "../../types.mts";

const key = { owner: "acme", repo: "widgets", pr: 42 };
const pull: CheckBlockerRef = { owner: "acme", name: "widgets", number: 9, kind: "pull" };
const issue: CheckBlockerRef = { owner: "acme", name: "widgets", number: 3, kind: "issue" };
let stateDir: string;

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), "pr-shepherd-gate-"));
  process.env["PR_SHEPHERD_STATE_DIR"] = stateDir;
  mockGraphql.mockReset();
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(stateDir, { recursive: true, force: true });
});

function pullData(state: string, merged: boolean) {
  return { data: { repository: { pullRequest: { state, merged } } } };
}

describe("resolveCheckBlockerGate", () => {
  it("skips GitHub when nothing matches", async () => {
    expect(await resolveCheckBlockerGate(key, [{ name: "lint" }])).toBeNull();
    await writeCheckBlocker(key, { checkName: "other", blocker: pull, recordedAt: 1 });
    expect(await resolveCheckBlockerGate(key, [{ name: "lint" }])).toBeNull();
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  it("dedupes one lookup and classifies pull and issue states", async () => {
    await writeCheckBlocker(key, { checkName: "backend-tests (1)", blocker: pull, recordedAt: 1 });
    await writeCheckBlocker(key, { checkName: "backend-tests (2)", blocker: pull, recordedAt: 2 });
    await writeCheckBlocker(key, { checkName: "lint", blocker: issue, recordedAt: 3 });
    mockGraphql.mockImplementation(async (query: string) => {
      expect(query).toContain("_shepherdRateLimit");
      if (query.includes("pullRequest")) return pullData("OPEN", false);
      return { data: { repository: { issue: { state: "OPEN" } } } };
    });
    const gate = await resolveCheckBlockerGate(key, [
      { name: "backend-tests (1)" },
      { name: "backend-tests (2)" },
      { name: "lint" },
    ]);
    expect(mockGraphql).toHaveBeenCalledTimes(2);
    expect(gate?.openBlockers).toEqual(["acme/widgets#9", "acme/widgets#3"]);
    expect([...(gate?.deferredNames ?? [])].sort()).toEqual([
      "backend-tests (1)",
      "backend-tests (2)",
      "lint",
    ]);
  });

  it.each([
    ["MERGED", true, "released"],
    ["CLOSED", false, "released"],
    ["OPEN", true, "released"],
  ] as const)("treats pull %s merged=%s as %s", async (state, merged, status) => {
    await writeCheckBlocker(key, { checkName: "lint", blocker: pull, recordedAt: 1 });
    mockGraphql.mockResolvedValue(pullData(state, merged));
    const gate = await resolveCheckBlockerGate(key, [{ name: "lint" }]);
    expect(gate?.releasedNames.has("lint")).toBe(true);
    expect(gate?.deferredNames.size).toBe(0);
    expect(status).toBe("released");
  });

  it("treats a closed issue as released and ignores a missing pull", async () => {
    await writeCheckBlocker(key, { checkName: "lint", blocker: issue, recordedAt: 1 });
    mockGraphql.mockResolvedValue({ data: { repository: { issue: { state: "CLOSED" } } } });
    expect(
      (await resolveCheckBlockerGate(key, [{ name: "lint" }]))?.releasedNames.has("lint"),
    ).toBe(true);
    await writeCheckBlocker(key, { checkName: "lint", blocker: pull, recordedAt: 2 });
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockGraphql.mockResolvedValue({ data: { repository: null } });
    expect(await resolveCheckBlockerGate(key, [{ name: "lint" }])).toBeNull();
    expect(String(stderr.mock.calls[0]?.[0])).toContain(
      "check blocker lookup failed for acme/widgets#9 (ignored): not found",
    );
    mockGraphql.mockResolvedValue(pullData("UNKNOWN", false));
    expect(await resolveCheckBlockerGate(key, [{ name: "lint" }])).toBeNull();
    mockGraphql.mockResolvedValue({ data: { repository: { issue: { state: "LOCKED" } } } });
    await writeCheckBlocker(key, { checkName: "lint", blocker: issue, recordedAt: 3 });
    expect(await resolveCheckBlockerGate(key, [{ name: "lint" }])).toBeNull();
    mockGraphql.mockRejectedValue("boom");
    expect(await resolveCheckBlockerGate(key, [{ name: "lint" }])).toBeNull();
    expect(stderr.mock.calls.map((call) => String(call[0])).join("")).toContain("boom");
    stderr.mockRestore();
  });

  it("clears a released blocker once the branch is current and keeps it while behind", async () => {
    await writeCheckBlocker(key, { checkName: "lint", blocker: pull, recordedAt: 1 });
    mockGraphql.mockResolvedValue(pullData("MERGED", true));
    const behind = await resolveCheckBlockerGate(key, [{ name: "lint" }], "BEHIND");
    expect(behind?.releasedNames.has("lint")).toBe(true);
    expect(await readCheckBlockers(key)).toHaveLength(1);

    const current = await resolveCheckBlockerGate(key, [{ name: "lint" }], "CLEAN");
    expect(current).toBeNull();
    expect(await readCheckBlockers(key)).toEqual([]);
  });

  it("propagates a rate-limit error", async () => {
    await writeCheckBlocker(key, { checkName: "lint", blocker: pull, recordedAt: 1 });
    const err = new GitHubRequestError("API rate limit exceeded", { status: 429 });
    mockGraphql.mockRejectedValue(err);
    await expect(resolveCheckBlockerGate(key, [{ name: "lint" }])).rejects.toBe(err);
    expect(pollRateLimitRetryAfterMs(err)).not.toBeNull();
  });
});

describe("annotateBlockedWait", () => {
  const wait = { action: "wait", log: "WAIT: idle" } as IterateResult;
  const gate = {
    deferredNames: new Set(["lint"]),
    releasedNames: new Set<string>(),
    openBlockers: ["acme/widgets#9"],
  };

  it("names the blocker once on WAIT and leaves other results alone", () => {
    expect(annotateBlockedWait(wait, null)).toBe(wait);
    expect(annotateBlockedWait({ action: "fix_code" } as IterateResult, gate)).toMatchObject({
      action: "fix_code",
    });
    expect(annotateBlockedWait(wait, { ...gate, openBlockers: [] })).toBe(wait);
    const annotated = annotateBlockedWait(wait, gate);
    expect(annotated).toMatchObject({ log: "WAIT: idle — blocked by acme/widgets#9" });
    expect(annotateBlockedWait(annotated, gate)).toBe(annotated);
  });
});
