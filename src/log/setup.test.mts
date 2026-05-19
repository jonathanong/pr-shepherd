import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetRepoInfo, mockInitLog, mockAppendEntry, mockBuildSessionHeader, mockFormatOutput } =
  vi.hoisted(() => ({
    mockGetRepoInfo: vi.fn(),
    mockInitLog: vi.fn(),
    mockAppendEntry: vi.fn(),
    mockBuildSessionHeader: vi.fn(),
    mockFormatOutput: vi.fn(),
  }));

vi.mock("../github/client.mts", () => ({
  getRepoInfo: mockGetRepoInfo,
}));

vi.mock("./log-file.mts", () => ({
  initLog: mockInitLog,
  appendEntry: mockAppendEntry,
}));

vi.mock("./session.mts", () => ({
  buildSessionHeader: mockBuildSessionHeader,
  formatOutputEntry: mockFormatOutput,
}));

let originalWrite: typeof process.stdout.write;

async function freshSetupLog() {
  vi.resetModules();
  const mod = await import("./setup.mts");
  return mod.setupLog;
}

beforeEach(() => {
  originalWrite = process.stdout.write;
  mockGetRepoInfo.mockReset().mockResolvedValue({ owner: "acme", name: "widgets" });
  mockInitLog.mockReset().mockResolvedValue({ path: "/tmp/shepherd.md" });
  mockAppendEntry.mockReset();
  mockBuildSessionHeader.mockReset().mockReturnValue({ markdown: "## header\n" });
  mockFormatOutput.mockReset().mockReturnValue("### Output\n");
});

afterEach(() => {
  process.stdout.write = originalWrite;
});

describe("setupLog", () => {
  it("returns without throwing when getRepoInfo fails", async () => {
    mockGetRepoInfo.mockRejectedValueOnce(new Error("not in a git repo"));
    const setupLog = await freshSetupLog();

    await expect(setupLog(["node", "bin/index.mjs", "check"])).resolves.toBeUndefined();

    expect(mockInitLog).not.toHaveBeenCalled();
  });

  it("returns without installing stdout tee when initLog returns null", async () => {
    mockInitLog.mockResolvedValueOnce(null);
    const setupLog = await freshSetupLog();

    await setupLog(["node", "bin/index.mjs", "check"]);

    expect(process.stdout.write).toBe(originalWrite);
    expect(mockAppendEntry).not.toHaveBeenCalled();
  });

  it("writes the session header and tees text output", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    originalWrite = writeSpy as unknown as typeof process.stdout.write;
    const setupLog = await freshSetupLog();

    await setupLog(["node", "bin/index.mjs", "check", "--format", "json"]);
    process.stdout.write("hello");

    expect(mockBuildSessionHeader).toHaveBeenCalledWith([
      "node",
      "bin/index.mjs",
      "check",
      "--format",
      "json",
    ]);
    expect(mockFormatOutput).toHaveBeenCalledWith("hello", "json");
    expect(mockAppendEntry).toHaveBeenCalledWith("## header\n");
    expect(mockAppendEntry).toHaveBeenCalledWith("### Output\n");
    expect(writeSpy).toHaveBeenCalledWith("hello", undefined, undefined);
  });

  it("detects inline JSON format and converts Uint8Array chunks", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    originalWrite = writeSpy as unknown as typeof process.stdout.write;
    const setupLog = await freshSetupLog();

    await setupLog(["node", "bin/index.mjs", "check", "--format=json"]);
    process.stdout.write(Buffer.from("hello"));

    expect(mockFormatOutput).toHaveBeenCalledWith("hello", "json");
  });

  it("does not append empty output and ignores append errors", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    originalWrite = writeSpy as unknown as typeof process.stdout.write;
    mockAppendEntry
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error("disk full");
      });
    const setupLog = await freshSetupLog();

    await setupLog(["node", "bin/index.mjs", "check"]);
    process.stdout.write("");
    process.stdout.write("visible", () => undefined);

    expect(mockFormatOutput).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith("", undefined, undefined);
    expect(writeSpy).toHaveBeenCalledWith("visible", expect.any(Function));
  });

  it("is a no-op after the first successful call", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    originalWrite = writeSpy as unknown as typeof process.stdout.write;
    const setupLog = await freshSetupLog();

    await setupLog(["node", "bin/index.mjs", "check"]);
    await setupLog(["node", "bin/index.mjs", "check"]);

    expect(mockGetRepoInfo).toHaveBeenCalledTimes(1);
  });

  it("swallows errors while installing the stdout tee", async () => {
    mockBuildSessionHeader.mockImplementationOnce(() => {
      throw new Error("header failed");
    });
    const setupLog = await freshSetupLog();

    await expect(setupLog(["node", "bin/index.mjs", "check"])).resolves.toBeUndefined();
  });
});
