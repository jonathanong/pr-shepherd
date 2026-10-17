import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoadConfig, mockRunLogFile } = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockRunLogFile: vi.fn(),
}));
vi.mock("./config/load.mts", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadConfig: mockLoadConfig,
}));
vi.mock("./commands/log-file.mts", () => ({ runLogFile: mockRunLogFile }));

import { main } from "./cli-parser.mts";
import { EXIT, ShepherdError } from "./exit-codes.mts";

let stderr: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("main — config validation", () => {
  it("exits 78 with the config error before dispatching", async () => {
    mockLoadConfig.mockImplementation(() => {
      throw new ShepherdError(
        "invalid config in /repo/.pr-shepherdrc.yml:\n  - `watch.readyDelayMinutes` → `iterate.ready-delay-minutes`",
        EXIT.CONFIG,
      );
    });
    await main(["node", "shepherd", "log-file"]);
    expect(process.exitCode).toBe(78);
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining(
        "pr-shepherd: invalid config in /repo/.pr-shepherdrc.yml:\n  - `watch.readyDelayMinutes` → `iterate.ready-delay-minutes`",
      ),
    );
    expect(mockRunLogFile).not.toHaveBeenCalled();
  });

  it("still prints help when the config is invalid", async () => {
    mockLoadConfig.mockImplementation(() => {
      throw new ShepherdError("invalid config", EXIT.CONFIG);
    });
    await main(["node", "shepherd", "iterate", "--help"]);
    expect(process.exitCode).toBeUndefined();
    expect(mockLoadConfig).not.toHaveBeenCalled();
  });

  it("rethrows unexpected errors", async () => {
    mockLoadConfig.mockImplementation(() => {
      throw new Error("disk on fire");
    });
    await expect(main(["node", "shepherd", "log-file"])).rejects.toThrow("disk on fire");
  });
});
