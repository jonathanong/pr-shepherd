import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithExecutionCwd } from "../execution-context.mts";
import {
  checkPatchesApply,
  getLocalHeadSha,
  getPathsStatus,
  isAncestor,
  readPrHeadFile,
} from "./suggestion-patch-git.mts";

const execFile = promisify(execFileCb);
let repoDir: string;
let firstHead: string;
let secondHead: string;

beforeAll(async () => {
  repoDir = await mkdtemp(join(tmpdir(), "pr-shepherd-suggestions-"));
  await execFile("git", ["init", "-q"], { cwd: repoDir });
  await execFile("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
  await execFile("git", ["config", "user.name", "Test"], { cwd: repoDir });
  await writeFile(join(repoDir, "file.txt"), "a\nb\nold\nc\nd\n");
  await execFile("git", ["add", "file.txt"], { cwd: repoDir });
  await execFile("git", ["commit", "-qm", "first"], { cwd: repoDir });
  firstHead = (await execFile("git", ["rev-parse", "HEAD"], { cwd: repoDir })).stdout.trim();
  await writeFile(join(repoDir, "other.txt"), "other\n");
  await execFile("git", ["add", "other.txt"], { cwd: repoDir });
  await execFile("git", ["commit", "-qm", "second"], { cwd: repoDir });
  secondHead = (await execFile("git", ["rev-parse", "HEAD"], { cwd: repoDir })).stdout.trim();
});

afterAll(async () => {
  await rm(repoDir, { recursive: true, force: true });
});

describe("suggestion patch git helpers", () => {
  it("reads PR-head blobs and recognizes equal, descendant, and diverged ancestry", async () => {
    await runWithExecutionCwd(repoDir, async () => {
      expect(await getLocalHeadSha()).toBe(secondHead);
      expect(await readPrHeadFile(firstHead, "file.txt")).toBe("a\nb\nold\nc\nd\n");
      expect(await isAncestor(firstHead, secondHead)).toBe(true);
      expect(await isAncestor(secondHead, firstHead)).toBe(false);
      expect(await isAncestor("0".repeat(40), secondHead)).toBe(false);
    });
    await runWithExecutionCwd(join(repoDir, "missing"), async () => {
      await expect(isAncestor(firstHead, secondHead)).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("surfaces path status and only dry-runs ordered patches", async () => {
    await runWithExecutionCwd(repoDir, async () => {
      expect(await getPathsStatus(["file.txt"])).toBe("");
      await writeFile(join(repoDir, "file.txt"), "dirty\n");
      expect(await getPathsStatus(["file.txt"])).toContain("file.txt");
      await writeFile(join(repoDir, "file.txt"), "a\nb\nold\nc\nd\n");

      const patch = "--- a/file.txt\n+++ b/file.txt\n@@ -2,3 +2,3 @@\n b\n-old\n+new\n c\n";
      await expect(checkPatchesApply([patch])).resolves.toBeUndefined();
      const insert = "--- a/file.txt\n+++ b/file.txt\n@@ -1,3 +1,4 @@\n a\n+prefix\n b\n old\n";
      await expect(checkPatchesApply([insert, patch])).resolves.toBeUndefined();
      await expect(checkPatchesApply([patch.replace("-old", "-wrong")])).rejects.toThrow(
        "patch does not apply",
      );
      expect(await readPrHeadFile(secondHead, "file.txt")).toBe("a\nb\nold\nc\nd\n");
    });
  });
});
