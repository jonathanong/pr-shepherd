import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./log/setup.mts", () => ({ setupLog: vi.fn() }));

import {
  getStderr,
  getStdout,
  mockRunIterate,
  registerHooks,
} from "../test-helpers/cli-parser.iterate.test-support.mts";
import { makeIterateResult } from "../fixtures/cli-parser.iterate-fixtures.mts";
import { main } from "./cli-parser.mts";
import { EXIT } from "./exit-codes.mts";

registerHooks();

describe("main — positional poll output", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps draft WAIT progress on stderr, then emits the full cancel result", async () => {
    mockRunIterate
      .mockResolvedValueOnce({ ...makeIterateResult("wait"), isDraft: true })
      .mockResolvedValue(makeIterateResult("cancel"));

    const promise = main(["node", "shepherd", "42", "--interval", "30s", "--timeout", "300s"]);
    await vi.advanceTimersByTimeAsync(0);

    expect(getStdout()).toBe("");
    expect(getStderr()).toContain("[poll tick 1 / +0s] WAIT — still running; next tick in 30s");

    await vi.advanceTimersByTimeAsync(30_000);
    await promise;

    expect(mockRunIterate).toHaveBeenCalledTimes(2);
    expect(getStdout()).toContain("[CANCEL]");
    expect(getStdout()).toContain("## Instructions");
    expect(getStdout()).not.toContain("still running");
    expect(process.exitCode).toBe(EXIT.OK);
  });

  it("emits one JSON terminal result after positional WAIT progress", async () => {
    mockRunIterate
      .mockResolvedValueOnce({ ...makeIterateResult("wait"), isDraft: true })
      .mockResolvedValue(makeIterateResult("cancel"));

    const promise = main([
      "node",
      "shepherd",
      "42",
      "--interval",
      "30s",
      "--timeout",
      "300s",
      "--format=json",
    ]);
    await vi.advanceTimersByTimeAsync(30_000);
    await promise;

    const output = JSON.parse(getStdout()) as { action: string; instructions: string[] };
    expect(output.action).toBe("cancel");
    expect(output.instructions).toHaveLength(1);
    expect(getStdout()).not.toContain("still running");
    expect(getStderr()).toContain("WAIT — still running; next tick in 30s");
    expect(process.exitCode).toBe(EXIT.OK);
  });

  it("emits the full WAIT result and instructions when positional polling times out", async () => {
    mockRunIterate.mockResolvedValue({ ...makeIterateResult("wait"), isDraft: true });

    const promise = main(["node", "shepherd", "42", "--interval", "30s", "--timeout", "60s"]);
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;

    expect(mockRunIterate).toHaveBeenCalledTimes(3);
    expect(getStdout()).toContain("[WAIT]");
    expect(getStdout()).toContain("## Instructions");
    expect(process.exitCode).toBe(EXIT.WAIT);
  });
});
