import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RC_FILENAME = ".pr-shepherdrc.yml";

export function makeTempConfigDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writeRcFile(dir: string, body: string): void {
  writeFileSync(join(dir, RC_FILENAME), body);
}

export function removeTempConfigDir(dir: string | null | undefined): void {
  if (dir !== null && dir !== undefined) rmSync(dir, { recursive: true, force: true });
}

export function stringListYaml(key: string, values: string[]): string {
  const lines = values.map((value) => `  - ${JSON.stringify(value)}`);
  return [`${key}:`, ...lines, ""].join("\n");
}
