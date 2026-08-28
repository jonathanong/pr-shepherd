import { readFile } from "node:fs/promises";
import { EXIT, errorToExitCode } from "../exit-codes.mts";
import { runJournal } from "../commands/journal/index.mts";
import { getFlag } from "./args.mts";
import { parseCliPrReference, resolveParsedPrTarget } from "../pr-reference.mts";
import { USAGE } from "./help.mts";
import { formatJournalResult } from "./journal-formatter.mts";

export async function handleJournal(
  args: string[],
  command: "apply journal" | "journal" = "apply journal",
): Promise<void> {
  for (const a of args) {
    if (!a.startsWith("--")) continue;
    if (a === "--dry-run" || a === "--format" || a.startsWith("--format=")) continue;
    if (a === "--file" || a.startsWith("--file=")) continue;
    process.stderr.write(`pr-shepherd: ${command}: unknown flag: "${a}"\n`);
    process.exitCode = EXIT.USAGE;
    return;
  }

  const { prNumber, targetRepository, extra } = parseJournalArgs(args);
  const filePath = getFlag(args, "--file");

  if (filePath !== null && extra[0]) {
    process.stderr.write(
      `pr-shepherd: ${command}: provide the entry as a positional argument or via --file, not both\n`,
    );
    process.exitCode = EXIT.USAGE;
    return;
  }

  let rawItem: string | undefined;
  try {
    rawItem = filePath !== null ? await readItemSource(filePath) : extra[0];
  } catch (e) {
    process.stderr.write(`pr-shepherd: ${command}: ${String(e)}\n`);
    process.exitCode = EXIT.NOINPUT;
    return;
  }

  if (rawItem === undefined) {
    process.stderr.write(`${USAGE[command]}\n`);
    process.exitCode = EXIT.USAGE;
    return;
  }

  const dryRun = args.includes("--dry-run");
  const jsonOut =
    args.some((a) => a === "--format=json") ||
    args.some((a, i) => a === "--format" && args[i + 1] === "json");

  try {
    const result = await runJournal({ prNumber, targetRepository, rawItem, dryRun });
    if (jsonOut) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatJournalResult(result)}\n`);
    }
  } catch (e) {
    process.stderr.write(`pr-shepherd: ${command}: ${String(e)}\n`);
    process.exitCode = errorToExitCode(e);
  }
}

/** Reads the journal entry from a file, or from stdin when `filePath` is `-`. */
async function readItemSource(filePath: string): Promise<string> {
  if (filePath === "-") return readStdin();
  return readFile(filePath, "utf8");
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseJournalArgs(args: string[]): {
  prNumber: number | undefined;
  targetRepository?: { owner: string; name: string };
  extra: string[];
} {
  const flagConsumedIndices = new Set<number>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (
      (a === "--format" || a === "--file") &&
      i + 1 < args.length &&
      !args[i + 1]!.startsWith("--")
    ) {
      flagConsumedIndices.add(i);
      flagConsumedIndices.add(i + 1);
    }
  }

  let prNumber: number | undefined;
  let targetRepository: { owner: string; name: string } | undefined;
  const extra: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (flagConsumedIndices.has(i)) continue;
    const a = args[i]!;
    if (a.startsWith("--")) continue;
    if (prNumber === undefined) {
      const parsed = parseCliPrReference(a);
      if (parsed !== null) {
        const target = resolveParsedPrTarget(parsed);
        prNumber = target.prNumber;
        targetRepository = target.targetRepository;
        continue;
      }
    }
    extra.push(a);
  }

  return { prNumber, targetRepository, extra };
}
