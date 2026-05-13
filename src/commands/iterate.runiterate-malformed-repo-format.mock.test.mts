// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerIterateHooks,
  makeOpts,
  makeReport,
  mockRunCheck,
} from "./iterate-test-support.mts";
import { runIterate } from "./iterate/index.mts";

registerIterateHooks();

describe("runIterate — malformed repo format", () => {
  it("throws when report.repo has no slash (e.g. 'badformat')", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ repo: "badformat" }));

    await expect(runIterate(makeOpts())).rejects.toThrow(
      'Unexpected repo format: "badformat" (expected "owner/name")',
    );
  });

  it("throws when report.repo has a leading slash (e.g. '/noowner')", async () => {
    mockRunCheck.mockResolvedValue(makeReport({ repo: "/noowner" }));

    await expect(runIterate(makeOpts())).rejects.toThrow(
      'Unexpected repo format: "/noowner" (expected "owner/name")',
    );
  });
});
