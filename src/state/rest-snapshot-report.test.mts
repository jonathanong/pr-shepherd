import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePrStatePath } from "./base.mts";
import { fingerprintInputDigest } from "./pr-fingerprint.mts";
import { loadRestSnapshotReport, storeRestSnapshotReport } from "./rest-snapshot-report.mts";
import { testShepherdConfig } from "../../test-helpers/github/fingerprint-fixture.mts";
import type { ShepherdReport } from "../types.mts";

const key = { owner: "owner", repo: "repo", pr: 42 };
const report = {
  pr: 42,
  status: "IN_PROGRESS",
  repo: "owner/repo",
} as ShepherdReport;
const config = testShepherdConfig();
let dir: string;

beforeEach(async () => {
  dir = `${process.env["TMPDIR"] ?? "/var/tmp"}/shepherd-rest-report-${randomBytes(4).toString("hex")}`;
  await mkdir(dir, { recursive: true });
  process.env["PR_SHEPHERD_STATE_DIR"] = dir;
});
afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(dir, { recursive: true, force: true });
});

describe("rest snapshot report state", () => {
  it("returns null when nothing is stored", async () => {
    expect(await loadRestSnapshotReport(key)).toBeNull();
  });

  it("round-trips the report with its digests", async () => {
    await storeRestSnapshotReport(key, "snap", report, config);
    await expect(loadRestSnapshotReport(key)).resolves.toEqual({
      version: 1,
      inputDigest: fingerprintInputDigest(config),
      snapshotDigest: "snap",
      report,
    });
  });

  it("rejects malformed or mismatched entries", async () => {
    const path = resolvePrStatePath(key, "rest-report.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "{not-json", "utf8");
    expect(await loadRestSnapshotReport(key)).toBeNull();
    await writeFile(path, JSON.stringify({ version: 99, report: {} }), "utf8");
    expect(await loadRestSnapshotReport(key)).toBeNull();
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        inputDigest: "d",
        snapshotDigest: "s",
        report: null,
      }),
      "utf8",
    );
    expect(await loadRestSnapshotReport(key)).toBeNull();
  });

  it("swallows write failures", async () => {
    const blocker = `${dir}-file`;
    await writeFile(blocker, "x", "utf8");
    process.env["PR_SHEPHERD_STATE_DIR"] = blocker;
    await expect(storeRestSnapshotReport(key, "s", report, config)).resolves.toBeUndefined();
    await rm(blocker, { force: true });
  });

  it("swallows temp-file cleanup failures", async () => {
    await storeRestSnapshotReport(key, "s", report, config);
    const parent = dirname(resolvePrStatePath(key, "rest-report.json"));
    await chmod(parent, 0o555);
    await expect(storeRestSnapshotReport(key, "s", report, config)).resolves.toBeUndefined();
    await chmod(parent, 0o755);
  });
});
