import { readFile } from "node:fs/promises";
import { runJournal } from "../commands/journal/index.mts";
import { getFlag, parsePrNumber } from "./args.mts";
import { USAGE } from "./help.mts";

export async function handleJournal(args: string[]): Promise<void> {
  for (const a of args) {
    if (!a.startsWith("--")) continue;
    if (a === "--dry-run" || a === "--format" || a.startsWith("--format=")) continue;
    if (a === "--file" || a.startsWith("--file=")) continue;
    process.stderr.write(`pr-shepherd: journal: unknown flag: "${a}"\n`);
    process.exitCode = 1;
    return;
  }

  const { prNumber, extra } = parseJournalArgs(args);
  const filePath = getFlag(args, "--file");

  if (filePath !== null && extra[0]) {
    process.stderr.write(
      `pr-shepherd: journal: provide the entry as a positional argument or via --file, not both\n`,
    );
    process.exitCode = 1;
    return;
  }

  let rawItem: string | undefined;
  try {
    rawItem = filePath !== null ? await readItemSource(filePath) : extra[0];
  } catch (e) {
    process.stderr.write(`pr-shepherd: journal: ${String(e)}\n`);
    process.exitCode = 1;
    return;
  }

  if (rawItem === undefined) {
    process.stderr.write(`${USAGE.journal}\n`);
    process.exitCode = 1;
    return;
  }

  const dryRun = args.includes("--dry-run");
  const jsonOut =
    args.some((a) => a === "--format=json") ||
    args.some((a, i) => a === "--format" && args[i + 1] === "json");

  try {
    const result = await runJournal({ prNumber, rawItem, dryRun });
    if (jsonOut) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatJournalResult(result)}\n`);
    }
  } catch (e) {
    process.stderr.write(`pr-shepherd: journal: ${String(e)}\n`);
    process.exitCode = 1;
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

function parseJournalArgs(args: string[]): { prNumber: number | undefined; extra: string[] } {
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
  const extra: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (flagConsumedIndices.has(i)) continue;
    const a = args[i]!;
    if (a.startsWith("--")) continue;
    if (prNumber === undefined) {
      const n = parsePrNumber(a);
      if (n !== null) {
        prNumber = n;
        continue;
      }
    }
    extra.push(a);
  }

  return { prNumber, extra };
}

function formatJournalResult(result: {
  prNumber: number;
  mutated: boolean;
  sectionExisted: boolean;
  dryRun: boolean;
  previewBody?: string;
}): string {
  if (result.dryRun) {
    const lines = ["Dry run — no body change written."];
    if (result.previewBody !== undefined) {
      lines.push("", result.previewBody);
    }
    return lines.join("\n");
  }
  if (!result.mutated) return "No change — entry already present.";
  if (!result.sectionExisted)
    return `Created ## Shepherd Journal section in PR #${result.prNumber}.`;
  return `Appended to ## Shepherd Journal in PR #${result.prNumber}.`;
}
