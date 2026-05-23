import { hasFlag } from "./args.mts";

export type ParseMarkFilesAsViewedResult =
  | { ok: true; files: string[]; tests: boolean; matchPatterns: string[] }
  | { ok: false; error: string };

export function parseMarkFilesAsViewedArgs(args: string[]): ParseMarkFilesAsViewedResult {
  const files: string[] = [];
  const matchPatterns: string[] = [];
  const tests = hasFlag(args, "--tests");

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "--tests") continue;
    if (arg === "--match") {
      const value = args[i + 1];
      if (value === undefined || value.startsWith("--")) {
        return { ok: false, error: "--match requires a regex value" };
      }
      matchPatterns.push(value);
      i += 1;
      continue;
    }
    if (arg.startsWith("--match=")) {
      const value = arg.slice("--match=".length);
      if (value === "") return { ok: false, error: "--match requires a regex value" };
      matchPatterns.push(value);
      continue;
    }
    if (arg.startsWith("--")) return { ok: false, error: `unknown flag: "${arg}"` };
    files.push(arg);
  }

  if (files.length === 0 && !tests && matchPatterns.length === 0) {
    return { ok: false, error: "provide at least one file, --tests, or --match <regex>" };
  }

  return { ok: true, files, tests, matchPatterns };
}
