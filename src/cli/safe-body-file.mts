import { constants } from "node:fs";
import { open } from "node:fs/promises";

import { EXIT, ShepherdError } from "../exit-codes.mts";

type FileHandle = Awaited<ReturnType<typeof open>>;

export interface SafeBodyFileReaderDependencies {
  platform: NodeJS.Platform;
  noFollow: number | undefined;
  nonBlock: number | undefined;
  open: (filePath: string, flags: number) => Promise<FileHandle>;
}

const DEFAULT_DEPENDENCIES: SafeBodyFileReaderDependencies = {
  platform: process.platform,
  noFollow: constants.O_NOFOLLOW,
  nonBlock: constants.O_NONBLOCK,
  open,
};

/**
 * Reads a regular file after rejecting unsafe final path entries without exposing its contents.
 * Callers must trust parent directories: O_NOFOLLOW only protects the final path entry.
 */
export async function readSafeBodyFile(
  filePath: string,
  dependencies: SafeBodyFileReaderDependencies = DEFAULT_DEPENDENCIES,
): Promise<string> {
  const flags = safeOpenFlags(dependencies);
  if (flags === null) throw noInput();

  let handle: FileHandle | undefined;
  try {
    handle = await dependencies.open(filePath, flags);
    if (!(await handle.stat()).isFile()) throw new Error("not a regular file");
    return await handle.readFile({ encoding: "utf8" });
  } catch {
    throw noInput();
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

function safeOpenFlags(dependencies: SafeBodyFileReaderDependencies): number | null {
  if (
    dependencies.platform === "win32" ||
    dependencies.noFollow === undefined ||
    dependencies.nonBlock === undefined
  ) {
    return null;
  }
  return constants.O_RDONLY | dependencies.noFollow | dependencies.nonBlock;
}

function noInput(): ShepherdError {
  return new ShepherdError("body file could not be read safely", EXIT.NOINPUT);
}
