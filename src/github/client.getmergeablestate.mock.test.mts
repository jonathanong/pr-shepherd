import { describe, it, expect } from "vitest";
import {
  mockFetch,
  restOk,
  registerClientHooks,
} from "../../test-helpers/github/client.test-support.mts";
import { getMergeableState } from "./client.mts";

registerClientHooks();

describe("getMergeableState", () => {
  it("maps REST true/clean to MERGEABLE/CLEAN", async () => {
    mockFetch.mockResolvedValue(restOk({ mergeable: true, mergeable_state: "clean" }));
    const result = await getMergeableState(42, "owner", "repo");
    expect(result).toEqual({ mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" });
  });

  it("maps REST false/dirty to CONFLICTING/DIRTY", async () => {
    mockFetch.mockResolvedValue(restOk({ mergeable: false, mergeable_state: "dirty" }));
    const result = await getMergeableState(42, "owner", "repo");
    expect(result).toEqual({ mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" });
  });

  it("maps REST null to UNKNOWN", async () => {
    mockFetch.mockResolvedValue(restOk({ mergeable: null, mergeable_state: "unknown" }));
    const result = await getMergeableState(42, "owner", "repo");
    expect(result).toEqual({ mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" });
  });
});
