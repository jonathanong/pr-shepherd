import { parseArgs } from "node:util";
import { EXIT, ShepherdError } from "../exit-codes.mts";
import { getRepoInfo, type RepoInfo } from "../github/client.mts";
import {
  parseCliPrReference,
  normalizeRepositoryIdentity,
  resolveParsedPrTarget,
  type ParsedPrReference,
} from "../pr-reference.mts";
import type { GlobalOptions } from "../types.mts";
import { rejectRemovedFlags } from "./removed-flags.mts";

const VALUE_FLAGS = new Set([
  "--format",
  "--ready-delay",
  "--stall-timeout",
  "--instructions",
  "--interval",
  "--timeout",
  "--debounce",
]);

export interface ParsedPollTargets {
  refs: ParsedPrReference[];
  global: GlobalOptions;
  extra: string[];
}

/** Splits PR references from flags. Returns null after printing a usage error. */
export function parsePollTargets(args: string[]): ParsedPollTargets | null {
  if (rejectRemovedFlags(args)) return null;
  const { values } = parseArgs({
    args,
    strict: false,
    allowPositionals: true,
    options: { format: { type: "string" }, verbose: { type: "boolean" } },
  });
  const consumed = new Set<number>();
  const refs: ParsedPrReference[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (VALUE_FLAGS.has(arg)) {
      if (arg === "--format") {
        consumed.add(index);
        if (index + 1 < args.length) consumed.add(index + 1);
      }
      index += 1;
      continue;
    }
    const equals = arg.indexOf("=");
    const name = equals < 0 ? arg : arg.slice(0, equals);
    if (VALUE_FLAGS.has(name)) {
      if (name === "--format") consumed.add(index);
      continue;
    }
    if (arg === "--verbose") {
      consumed.add(index);
      continue;
    }
    if (arg.startsWith("--")) continue;
    const parsed = parseCliPrReference(arg);
    if (!parsed) continue;
    refs.push(parsed);
    consumed.add(index);
  }
  const format = (values.format ?? "text") as "text" | "json";
  return {
    refs,
    global: { format, verbose: values.verbose === true },
    extra: args.filter((_, index) => !consumed.has(index)),
  };
}

/** Resolves PR references that must all name one repository. */
export async function resolvePollTargets(parsed: ParsedPollTargets): Promise<{
  prNumbers: number[];
  targetRepository?: RepoInfo;
}> {
  const all = parsed.refs;
  if (all.length === 0) return { prNumbers: [] };
  const checkoutRepo = all.some((ref) => ref.repository === undefined)
    ? await getRepoInfo()
    : undefined;
  let selectedRepo: RepoInfo | undefined;
  const prNumbers: number[] = [];
  for (const ref of all) {
    const target = resolveParsedPrTarget(ref);
    if (target.prNumber === undefined) return usageThrow("PR number is required");
    const repo = target.targetRepository ?? checkoutRepo!;
    if (
      selectedRepo &&
      normalizeRepositoryIdentity(`${selectedRepo.owner}/${selectedRepo.name}`) !==
        normalizeRepositoryIdentity(`${repo.owner}/${repo.name}`)
    ) {
      return usageThrow("aggregate poll only supports PRs from one repository");
    }
    selectedRepo = repo;
    if (!prNumbers.includes(target.prNumber)) prNumbers.push(target.prNumber);
  }
  return { prNumbers, targetRepository: selectedRepo };
}

function usageThrow(message: string): never {
  throw new ShepherdError(message, EXIT.USAGE);
}
