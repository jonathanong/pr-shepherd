import { describe, expect, it } from "vitest";
import { repo } from "../../test-helpers/github/rest-read.test-support.mts";
import {
  expectedStack,
  certify,
  stackedServer,
  mutations,
  upperSha,
} from "../../test-helpers/github/rest-stack-merge-readiness.test-support.mts";
import { runWithGithubTransport } from "../github/transport.mts";
import { runApplyMerge } from "./apply-merge.mts";
import { readMergeRequest } from "../state/merge-request.mts";

const apply = () =>
  runWithGithubTransport("rest", () =>
    runApplyMerge({
      prNumber: 102,
      targetRepository: repo,
      requireSha: upperSha,
      mergeAction: "direct_merge",
      mergeMethod: "squash",
      expectedStack,
    }),
  );
const key = { owner: repo.owner, repo: repo.name, pr: 102 };

describe("expected native-stack merge context over HTTP", () => {
  it.each(["missing", "identity", "trunk", "prefix", "order", "lower-head", "target-ref"])(
    "rejects changed %s before any submission or durable intent claim",
    async (change) => {
      const fixture = await stackedServer();
      await certify([101, 102]);
      if (change === "missing") fixture.nativeStack = null;
      else if (change === "identity") fixture.nativeStack!.number = 43;
      else if (change === "trunk") fixture.nativeStack!.base.ref = "new-trunk";
      else if (change === "prefix") fixture.nativeStack!.pull_requests = [{ number: 102 }];
      else if (change === "order") fixture.nativeStack!.pull_requests.reverse();
      else if (change === "lower-head") fixture.lowerHeadSha = "e".repeat(40);
      else fixture.upperBaseName = "another-parent";
      await expect(apply()).rejects.toThrow("Expected native stack");
      expect(mutations()).toEqual([]);
      expect(await readMergeRequest(key)).toBeNull();
    },
  );

  it("admits and persists the intended current prefix without sending local guards to GitHub", async () => {
    await stackedServer();
    await certify([101, 102]);
    await expect(apply()).resolves.toMatchObject({ status: "pending" });
    expect(await readMergeRequest(key)).toMatchObject({ options: { expectedStack } });
    expect(mutations()).toHaveLength(1);
    expect(mutations()[0]?.body).not.toHaveProperty("expectedStack");
  });

  it("rejects native membership disappearing during receipt validation", async () => {
    const fixture = await stackedServer();
    await certify([101, 102]);
    fixture.dropStackDuringValidation = true;
    await expect(apply()).rejects.toThrow();
    expect(mutations()).toEqual([]);
    expect(await readMergeRequest(key)).toBeNull();
  });

  it("rejects a prefix changed on the final membership read after validated topology", async () => {
    const fixture = await stackedServer();
    await certify([101, 102]);
    fixture.viewerReads = 0;
    fixture.changeMembershipAfterFinalTopology = true;
    await expect(apply()).rejects.toThrow("Native stack changed while validating");
    expect(mutations()).toEqual([]);
    expect(await readMergeRequest(key)).toBeNull();
  });

  it.each(["identity", "trunk"] as const)(
    "rejects %s changing between topology and the next membership read",
    async (change) => {
      const fixture = await stackedServer();
      await certify([101, 102]);
      fixture.viewerReads = 0;
      fixture.changeMembershipAfterInitialTopology = change;
      await expect(apply()).rejects.toThrow(
        "Native stack identity or trunk changed while validating",
      );
      expect(mutations()).toEqual([]);
      expect(await readMergeRequest(key)).toBeNull();
    },
  );
});
