import { describe, expect, it, vi } from "vitest";
import { freshLoadConfig, writeRc } from "../../test-helpers/config/load-test-support.mts";

describe("loadConfig — merge.commandArgs", () => {
  it("defaults to empty", async () => {
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.commandArgs).toEqual([]);
  });

  it("adds the default merge strategy to configured command args", async () => {
    writeRc("merge:\n  commandArgs:\n    - --delete-branch\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.commandArgs).toEqual(["--delete-branch", "--merge"]);
  });

  it("preserves one configured merge strategy", async () => {
    writeRc("merge:\n  commandArgs:\n    - --squash\n    - --delete-branch\n");
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.commandArgs).toEqual(["--squash", "--delete-branch"]);
  });

  it("rejects Shepherd-owned args and falls back to defaults", async () => {
    writeRc("merge:\n  commandArgs:\n    - --repo=other/repo\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.commandArgs).toEqual([]);
    expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain("Shepherd-owned");
  });

  it("rejects multiple strategies and falls back to defaults", async () => {
    writeRc("merge:\n  commandArgs:\n    - --squash\n    - --rebase\n");
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const loadConfig = await freshLoadConfig();
    expect(loadConfig().merge?.commandArgs).toEqual([]);
    expect(stderrSpy.mock.calls.map((c) => c[0]).join("")).toContain("multiple merge strategies");
  });
});
