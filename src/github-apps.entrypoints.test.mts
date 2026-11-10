import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPrShepherd } from "./api.mts";
import { main } from "./cli-parser.mts";
import { currentAuthTarget, runWithAuthScope } from "./github/auth-target.mts";
import { _resetTokenCache } from "./github/http-auth.mts";
import { parsePrReference, resolveParsedPrTarget } from "./pr-reference.mts";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

let home: string;
const previousHome = process.env["PR_SHEPHERD_HOME"];

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "app-entry-"));
  process.env["PR_SHEPHERD_HOME"] = home;
  process.exitCode = undefined;
  fetchMock.mockReset();
  _resetTokenCache();
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  process.env["PR_SHEPHERD_HOME"] = previousHome;
  process.exitCode = undefined;
  _resetTokenCache();
  vi.restoreAllMocks();
});

function writeApps(text: string): void {
  writeFileSync(join(home, "github-apps.yml"), text);
}

describe("GitHub App settings at the entry points", () => {
  it("exits 78 from the CLI before any GitHub work when the file is invalid", async () => {
    writeApps("apps: []\n");
    await main(["node", "shepherd", "log-file"]);

    expect(process.exitCode).toBe(78);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("github-apps.yml: `apps` must be a non-empty list"),
    );
  });

  it("rejects from the library API before GitHub work when the file is invalid", async () => {
    writeApps("nope: 1\n");
    const client = createPrShepherd({ transport: "rest" });

    await expect(client.getJournal({ pr: "owner/repo#1" })).rejects.toMatchObject({
      name: "ShepherdError",
      exitCode: 78,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a repository named by the caller as the command's target", async () => {
    await runWithAuthScope(async () => {
      resolveParsedPrTarget(parsePrReference("acme/widgets#4")!);
      expect(currentAuthTarget()).toEqual({ owner: "acme", repo: "widgets" });
    });
  });
});
