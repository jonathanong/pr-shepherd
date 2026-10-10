import { describe, expect, it } from "vitest";
import { wire, repo } from "../../test-helpers/github/rest-read.test-support.mts";
import {
  apply,
  certify,
  stackedServer,
  mutations,
  upperSha,
} from "../../test-helpers/github/rest-stack-merge-readiness.test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { claimMergeRequest, readMergeRequest } from "../state/merge-request.mts";
import { validateRestStackMergeReadiness } from "./rest-stack-merge-readiness.mts";

describe("REST native-stack merge readiness at the HTTP boundary", () => {
  it("rejects a guarded SHA that differs from the initial native topology", async () => {
    await stackedServer();
    await expect(
      runWithGithubTransport("rest", () =>
        validateRestStackMergeReadiness(102, repo, "e".repeat(40)),
      ),
    ).rejects.toThrow("Stack head changed");
    expect(mutations()).toEqual([]);
  });

  it.each(["closed", "wrong-trunk"])("rejects an unsafe %s lower dependency", async (condition) => {
    const fixture = await stackedServer();
    if (condition === "closed") fixture.bottomState = "closed";
    else fixture.bottomBase = "another-trunk";
    await expect(apply()).rejects.toThrow(
      condition === "closed" ? "closed or unverified" : "target the trunk",
    );
    expect(mutations()).toEqual([]);
  });

  it("rechecks native topology after valid receipts and rejects a last-read race", async () => {
    const fixture = await stackedServer();
    await certify([101, 102]);
    fixture.upperReads = 0;
    fixture.changeFinalTopology = true;
    await expect(apply()).rejects.toThrow("Native stack changed while validating");
    expect(mutations()).toEqual([]);
  });

  it("admits the current complete prefix with receipts bound to real REST summary evidence", async () => {
    await stackedServer();
    await certify([101, 102]);
    await expect(apply()).resolves.toMatchObject({ status: "pending" });
    expect(mutations()).toHaveLength(1);
    expect(mutations()[0]?.body).toMatchObject({ sha: upperSha, bypass_rules: false });
    expect(wire.requests.some((request) => request.path === "/graphql")).toBe(false);
  });

  it("rejects a missing lower-layer READY receipt when replacing an old-head enqueue", async () => {
    await stackedServer();
    await certify([102]);
    const key = { owner: repo.owner, repo: repo.name, pr: 102 };
    await claimMergeRequest(key, {
      version: 1,
      options: { requireSha: "e".repeat(40), mergeAction: "direct_merge" },
      startedAtUnix: 1,
      response: { status: "enqueued", details: {} },
    });
    await expect(apply()).rejects.toThrow("READY receipt");
    expect(mutations()).toHaveLength(0);
    expect((await readMergeRequest(key))?.options.requireSha).toBe("e".repeat(40));
  });

  it("rejects a stale parent boundary before any mutation", async () => {
    const fixture = await stackedServer();
    await certify([101, 102]);
    fixture.upperBaseSha = "e".repeat(40);
    await expect(apply()).rejects.toThrow("stale parent boundaries");
    expect(mutations()).toHaveLength(0);
  });

  it("rejects a head changed while revalidating receipt evidence before any mutation", async () => {
    const fixture = await stackedServer();
    await certify([101, 102]);
    fixture.changeDuringValidation = true;
    await expect(apply()).rejects.toThrow();
    expect(mutations()).toHaveLength(0);
    expect(wire.requests.some((request) => request.path === "/graphql")).toBe(false);
  });
});
