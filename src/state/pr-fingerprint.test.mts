import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePrStatePath } from "./base.mts";
import { loadPrFingerprint, storePrFingerprint } from "./pr-fingerprint.mts";
import { testFingerprint } from "../../test-helpers/github/fingerprint-fixture.mts";
import type { ShepherdReport } from "../types.mts";

const key = { owner: "owner", repo: "repo", pr: 42 };
const report = { pr: 42, status: "IN_PROGRESS", repo: "owner/repo" } as ShepherdReport;

let testStateDir: string;

beforeEach(async () => {
  testStateDir = `${process.env["TMPDIR"] ?? "/var/tmp"}/shepherd-fp-test-${randomBytes(4).toString("hex")}`;
  await mkdir(testStateDir, { recursive: true });
  process.env["PR_SHEPHERD_STATE_DIR"] = testStateDir;
});

afterEach(async () => {
  delete process.env["PR_SHEPHERD_STATE_DIR"];
  await rm(testStateDir, { recursive: true, force: true });
});

describe("pr-fingerprint state", () => {
  it("returns null when no file exists", async () => {
    expect(await loadPrFingerprint(key)).toBeNull();
  });

  it("round-trips a stored fingerprint and report", async () => {
    const fingerprint = testFingerprint({ headRefOid: "deadbeef" });
    await storePrFingerprint(key, fingerprint, report);
    await expect(loadPrFingerprint(key)).resolves.toEqual({
      version: 1,
      fingerprint,
      report,
    });
  });

  it("returns null for invalid JSON or a mismatched version", async () => {
    const path = resolvePrStatePath(key, "fingerprint.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "{not-json", "utf8");
    expect(await loadPrFingerprint(key)).toBeNull();
    await writeFile(path, JSON.stringify({ version: 99, fingerprint: {}, report: {} }), "utf8");
    expect(await loadPrFingerprint(key)).toBeNull();
  });
});
