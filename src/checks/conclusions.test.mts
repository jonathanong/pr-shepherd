import { describe, expect, it } from "vitest";
import { isFailingAgentCheck, canRerunWorkflows } from "./conclusions.mts";
import type { ViewerAuthorization } from "../types.mts";

describe("isFailingAgentCheck", () => {
  it("treats GitHub failure conclusions as failing", () => {
    expect(isFailingAgentCheck({ conclusion: "FAILURE" })).toBe(true);
    expect(isFailingAgentCheck({ conclusion: "TIMED_OUT" })).toBe(true);
    expect(isFailingAgentCheck({ conclusion: "CANCELLED" })).toBe(true);
    expect(isFailingAgentCheck({ conclusion: "STARTUP_FAILURE" })).toBe(true);
    expect(isFailingAgentCheck({ conclusion: "ACTION_REQUIRED" })).toBe(true);
    expect(isFailingAgentCheck({ conclusion: "STALE" })).toBe(true);
    expect(isFailingAgentCheck({ conclusion: null })).toBe(true);
  });

  it("treats success, skipped, and neutral as not failing", () => {
    expect(isFailingAgentCheck({ conclusion: "SUCCESS" })).toBe(false);
    expect(isFailingAgentCheck({ conclusion: "SKIPPED" })).toBe(false);
    expect(isFailingAgentCheck({ conclusion: "NEUTRAL" })).toBe(false);
  });

  it("excludes annotation-only carriers even when the conclusion is failing", () => {
    expect(isFailingAgentCheck({ conclusion: "FAILURE", annotationOnly: true })).toBe(false);
  });
});

function auth(repositoryPermission: ViewerAuthorization["repositoryPermission"]) {
  const value: ViewerAuthorization = {
    repositoryPermission,
    viewerCanAdminister: false,
    viewerDidAuthor: false,
    viewerCanUpdate: false,
    viewerCanEnableAutoMerge: false,
    viewerCanEditFiles: false,
    headRepositoryPermission: repositoryPermission,
  };
  return value;
}

describe("canRerunWorkflows", () => {
  it.each(["WRITE", "MAINTAIN", "ADMIN"] as const)(
    "grants rerun capability for repositoryPermission %s",
    (permission) => {
      expect(canRerunWorkflows(auth(permission))).toBe(true);
    },
  );

  it.each(["NONE", "READ", "TRIAGE"] as const)(
    "denies rerun capability for repositoryPermission %s",
    (permission) => {
      expect(canRerunWorkflows(auth(permission))).toBe(false);
    },
  );

  it("denies rerun capability for a null repositoryPermission", () => {
    expect(canRerunWorkflows(auth(null))).toBe(false);
  });

  it("denies rerun capability when authorization is unknown", () => {
    expect(canRerunWorkflows(undefined)).toBe(false);
  });
});
