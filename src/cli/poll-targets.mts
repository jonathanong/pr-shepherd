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

const VALUE_FLAGS = new Set([
  "--format",
  "--ready-delay",
  "--stall-timeout",
  "--interval",
  "--timeout",
  "--debounce",
  "--stack",
]);

export interface ParsedPollTargets {
  refs: ParsedPrReference[];
  stack: ParsedPrReference | undefined;
  global: GlobalOptions;
  extra: string[];
}

export function parsePollTargets(args: string[]): ParsedPollTargets | null {
  const { values } = parseArgs({
    args,
    strict: false,
    allowPositionals: true,
    options: { format: { type: "string" }, verbose: { type: "boolean" } },
  });
  const consumed = new Set<number>();
  const refs: ParsedPrReference[] = [];
  let stack: ParsedPrReference | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (VALUE_FLAGS.has(arg)) {
      if (arg === "--format" || arg === "--stack") {
        consumed.add(index);
        if (index + 1 < args.length) consumed.add(index + 1);
      }
      if (arg === "--stack") {
        const parsed = parseCliPrReference(args[index + 1] ?? "");
        if (!parsed)
          return usage(`invalid --stack PR reference: ${args[index + 1] ?? "(missing)"}`);
        if (stack) return usage("--stack may only be specified once");
        stack = parsed;
      }
      index += 1;
      continue;
    }
    const equals = arg.indexOf("=");
    const name = equals < 0 ? arg : arg.slice(0, equals);
    if (VALUE_FLAGS.has(name)) {
      if (name === "--format" || name === "--stack") consumed.add(index);
      if (name === "--stack") {
        const parsed = parseCliPrReference(arg.slice(equals + 1));
        if (!parsed) return usage(`invalid --stack PR reference: ${arg.slice(equals + 1)}`);
        if (stack) return usage("--stack may only be specified once");
        stack = parsed;
      }
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
  if (stack && refs.length > 0) return usage("--stack cannot be combined with explicit PRs");
  const format = (values.format ?? "text") as "text" | "json";
  return {
    refs,
    stack,
    global: { format, verbose: values.verbose === true },
    extra: args.filter((_, index) => !consumed.has(index)),
  };
}

export async function resolvePollTargets(parsed: ParsedPollTargets): Promise<{
  prNumbers: number[];
  stackPrNumber?: number;
  targetRepository?: RepoInfo;
}> {
  const all = parsed.stack ? [parsed.stack] : parsed.refs;
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
  return parsed.stack
    ? { prNumbers: [], stackPrNumber: prNumbers[0], targetRepository: selectedRepo }
    : { prNumbers, targetRepository: selectedRepo };
}

function usage(message: string): null {
  process.stderr.write(`pr-shepherd: ${message}\n`);
  process.exitCode = EXIT.USAGE;
  return null;
}

function usageThrow(message: string): never {
  throw new ShepherdError(message, EXIT.USAGE);
}
