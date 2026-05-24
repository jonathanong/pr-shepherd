import { beforeEach, afterEach } from "vitest";
import { randomBytes, createHash } from "node:crypto";
import { rm } from "node:fs/promises";

export function idToFilename(id: string): string {
  return createHash("sha256").update(id, "utf8").digest("hex") + ".json";
}

export const testKey = { owner: "test-owner", repo: "test-repo", pr: 123 };
export const testId = "PRRT_kwDOTest123";

export let testStateDir: string;

export function registerHooks(): void {
  beforeEach(() => {
    testStateDir = `${process.env["TMPDIR"] ?? "/tmp"}/shepherd-seen-test-${randomBytes(4).toString("hex")}`;
    process.env["PR_SHEPHERD_STATE_DIR"] = testStateDir;
  });

  afterEach(async () => {
    delete process.env["PR_SHEPHERD_STATE_DIR"];
    await rm(testStateDir, { recursive: true, force: true });
  });
}
