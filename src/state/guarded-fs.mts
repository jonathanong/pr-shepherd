/**
 * The one door for local state writes. Inside a read-only scope (`runReadOnly`, used by the library
 * `status` method) every write, delete, rename, link and directory creation is a silent no-op, so a
 * check can never create, refresh or clear state that a concurrent session owns. Reads stay on
 * `node:fs/promises` directly.
 */
import * as fsp from "node:fs/promises";
import { appendFileSync, mkdirSync } from "node:fs";
import { isReadOnly } from "../execution-context.mts";

export async function writeFile(...args: Parameters<typeof fsp.writeFile>): Promise<void> {
  if (isReadOnly()) return;
  await fsp.writeFile(...args);
}

export async function mkdir(...args: Parameters<typeof fsp.mkdir>): Promise<void> {
  if (isReadOnly()) return;
  await fsp.mkdir(...args);
}

export async function rename(...args: Parameters<typeof fsp.rename>): Promise<void> {
  if (isReadOnly()) return;
  await fsp.rename(...args);
}

export async function unlink(...args: Parameters<typeof fsp.unlink>): Promise<void> {
  if (isReadOnly()) return;
  await fsp.unlink(...args);
}

export async function rm(...args: Parameters<typeof fsp.rm>): Promise<void> {
  if (isReadOnly()) return;
  await fsp.rm(...args);
}

export async function link(...args: Parameters<typeof fsp.link>): Promise<void> {
  if (isReadOnly()) return;
  await fsp.link(...args);
}

export function appendFileSyncGuarded(...args: Parameters<typeof appendFileSync>): void {
  if (isReadOnly()) return;
  appendFileSync(...args);
}

export function mkdirSyncGuarded(...args: Parameters<typeof mkdirSync>): void {
  if (isReadOnly()) return;
  mkdirSync(...args);
}
