import { describe, expect, it } from "vitest";
import { repo } from "../../test-helpers/github/rest-read.test-support.mts";
import {
  aliasThreadFixAttempts,
  aliasThreadSeenMarkers,
  recordThreadIdentity,
  resolveGraphqlThreadId,
  resolveRestThreadRoot,
} from "./rest-identities.mts";
import type { FixAttemptsState } from "../state/fix-attempts.mts";
import type { SeenMarker } from "../state/seen-comments.mts";

describe("thread identity across transports", () => {
  it("keeps genuine opaque IDs when a REST snapshot later records the root", async () => {
    await recordThreadIdentity(repo, 101, "opaque-thread", 11);
    await recordThreadIdentity(repo, 101, "rest-thread-11", 11);
    expect(await resolveRestThreadRoot(repo, 101, "opaque-thread")).toBe("11");
    expect(await resolveGraphqlThreadId("rest-thread-11")).toBe("opaque-thread");
    await expect(resolveRestThreadRoot(repo, 102, "opaque-thread")).rejects.toThrow(
      "does not belong",
    );
  });

  it("preserves first-look and denial markers in both directions", async () => {
    await recordThreadIdentity(repo, 101, "opaque-thread", 11);
    const marker = { seenAt: 123, bodyHash: "same", deniedMutationBodyHash: "same" };
    const seen = new Map<string, SeenMarker>([["opaque-thread", marker]]);
    await aliasThreadSeenMarkers(repo, 101, ["rest-thread-11"], seen);
    expect(seen.get("rest-thread-11")).toEqual(marker);
    seen.delete("opaque-thread");
    await aliasThreadSeenMarkers(repo, 101, ["opaque-thread"], seen);
    expect(seen.get("opaque-thread")).toEqual(marker);
  });

  it("keeps attempt history through an adapter change without merging different body revisions", async () => {
    await recordThreadIdentity(repo, 101, "opaque-thread", 11);
    const state: FixAttemptsState = {
      headSha: "same",
      threadAttempts: { "opaque-thread": 2 },
      threadBodyHashes: { "opaque-thread": "body1" },
    };
    await aliasThreadFixAttempts(repo, 101, ["rest-thread-11"], state);
    expect(state.threadAttempts["rest-thread-11"]).toBe(2);
    delete state.threadAttempts["opaque-thread"];
    delete state.threadBodyHashes!["opaque-thread"];
    await aliasThreadFixAttempts(repo, 101, ["opaque-thread"], state);
    expect(state.threadAttempts["opaque-thread"]).toBe(2);
    state.threadAttempts["rest-thread-11"] = 1;
    state.threadBodyHashes!["rest-thread-11"] = "body2";
    await aliasThreadFixAttempts(repo, 101, ["rest-thread-11"], state);
    expect(state.threadAttempts["rest-thread-11"]).toBe(1);
    expect(state.threadBodyHashes!["rest-thread-11"]).toBe("body2");
  });
});
