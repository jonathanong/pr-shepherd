import { runJournal } from "../commands/journal/index.mts";
import { parsePrNumber } from "./args.mts";
import { USAGE } from "./help.mts";

export async function handleJournal(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`${USAGE.journal}\n`);
    return;
  }

  for (const a of args) {
    if (!a.startsWith("--")) continue;
    if (a === "--dry-run" || a === "--format" || a.startsWith("--format=")) continue;
    process.stderr.write(`pr-shepherd: journal: unknown flag: "${a}"\n`);
    process.exitCode = 1;
    return;
  }

  const { prNumber, extra } = parseJournalArgs(args);

  const rawItem = extra[0];
  if (!rawItem) {
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

function parseJournalArgs(args: string[]): { prNumber: number | undefined; extra: string[] } {
  const flagConsumedIndices = new Set<number>();
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--format" && i + 1 < args.length && !args[i + 1]!.startsWith("--")) {
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
