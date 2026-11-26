import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getExecutionCwd,
  isReadOnly,
  runReadOnly,
  runWithExecutionCwd,
} from "../execution-context.mts";
import { mkdir, rename, rm, unlink, writeFile } from "./guarded-fs.mts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "shepherd-guarded-fs-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("guarded-fs", () => {
  it("writes normally outside a read-only scope", async () => {
    await mkdir(join(dir, "a"), { recursive: true });
    await writeFile(join(dir, "a", "f"), "x");
    expect(readFileSync(join(dir, "a", "f"), "utf8")).toBe("x");
  });

  it("makes writes, directory creation, renames and deletes no-ops in a read-only scope", async () => {
    const existing = join(dir, "keep");
    writeFileSync(existing, "keep");
    await runReadOnly(async () => {
      await mkdir(join(dir, "new"), { recursive: true });
      await writeFile(join(dir, "new-file"), "x");
      await writeFile(existing, "changed");
      await rename(existing, join(dir, "moved"));
      await unlink(existing);
      await rm(existing, { force: true });
    });
    expect(readdirSync(dir)).toEqual(["keep"]);
    expect(readFileSync(existing, "utf8")).toBe("keep");
  });
});

describe("execution context", () => {
  it("keeps both the cwd and the read-only flag when scopes nest in either order", () => {
    runReadOnly(() =>
      runWithExecutionCwd("/a", () => {
        expect(getExecutionCwd()).toBe("/a");
        expect(isReadOnly()).toBe(true);
      }),
    );
    runWithExecutionCwd("/b", () =>
      runReadOnly(() => {
        expect(getExecutionCwd()).toBe("/b");
        expect(isReadOnly()).toBe(true);
      }),
    );
    expect(isReadOnly()).toBe(false);
  });
});
