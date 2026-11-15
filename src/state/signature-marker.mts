/** A one-field marker file in the PR state directory: "this exact situation was already presented". */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolvePrStatePath } from "./base.mts";

export interface StateKey {
  owner: string;
  repo: string;
  pr: number;
}

/** True when the marker file holds exactly this signature. */
export async function readSignatureMarker(
  key: StateKey,
  file: string,
  signature: string,
): Promise<boolean> {
  try {
    const parsed: unknown = JSON.parse(await readFile(resolvePrStatePath(key, file), "utf8"));
    return (
      parsed !== null &&
      typeof parsed === "object" &&
      (parsed as { signature?: unknown }).signature === signature
    );
  } catch {
    return false;
  }
}

/** True when the marker was saved; false when the state directory could not be written. */
export async function writeSignatureMarker(
  key: StateKey,
  file: string,
  signature: string,
): Promise<boolean> {
  try {
    const path = resolvePrStatePath(key, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ signature }));
    return true;
  } catch {
    return false;
  }
}
