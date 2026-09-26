import { vi } from "vitest";
import { NOW, makeOpts, mockUpdateReadyDelay } from "./iterate-test-support.mts";
import { readStallState, writeStallState } from "../../src/state/iterate-stall.mts";
import type { IterateCommandOptions } from "../../src/types.mts";

type StallState = Parameters<typeof writeStallState>[1];

const mockReadStallState = vi.mocked(readStallState);
const mockWriteStallState = vi.mocked(writeStallState);
const STALL_TIMEOUT_S = 1800;
const RESOLUTION_ONLY_THREAD = {
  id: "thread-resolution-only",
  isResolved: false,
  isOutdated: true,
  isMinimized: false,
  path: "src/old.mts",
  line: null,
  startLine: null,
  author: "reviewer",
  authorType: "Unknown" as const,
  body: "Already addressed on an old diff",
  url: "",
  createdAtUnix: NOW - 3600,
};

function makeOpts30mStall(overrides: Partial<IterateCommandOptions> = {}): IterateCommandOptions {
  // Stall applies to wait, not to a clean ready-delay countdown.
  mockUpdateReadyDelay.mockResolvedValue({
    isReady: false,
    shouldCancel: false,
    remainingSeconds: 300,
  });
  return makeOpts({ stallTimeoutSeconds: STALL_TIMEOUT_S, noAutoMarkReady: true, ...overrides });
}

export {
  RESOLUTION_ONLY_THREAD,
  STALL_TIMEOUT_S,
  makeOpts30mStall,
  mockReadStallState,
  mockWriteStallState,
};
export type { StallState };
