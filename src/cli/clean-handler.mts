import { runClean, type CleanVariant } from "../commands/clean.mts";
import { EXIT } from "../exit-codes.mts";
import { USAGE } from "./help.mts";
import { formatCleanResult } from "./formatters.mts";

const CLEAN_VARIANTS = new Set<string>(["pr", "branch", "current", "repo", "all"]);

export async function handleClean(args: string[]): Promise<void> {
  const command = "admin clean";
  const usage = USAGE["admin clean"];
  const variant = args[0];

  if (!variant || !CLEAN_VARIANTS.has(variant)) {
    process.stderr.write(`${usage}\n`);
    process.exitCode = EXIT.USAGE;
    return;
  }

  const rest = args.slice(1);

  for (const a of rest) {
    if (!a.startsWith("--")) continue;
    if (a === "--dry-run" || a === "--format" || a.startsWith("--format=")) continue;
    process.stderr.write(`pr-shepherd: ${command}: unknown flag: "${a}"\n`);
    process.exitCode = EXIT.USAGE;
    return;
  }

  const fmtIdx = rest.indexOf("--format");
  const fmtEqEntry = rest.find((a) => a.startsWith("--format="));
  let formatValue: string | undefined;
  if (fmtEqEntry !== undefined) {
    formatValue = fmtEqEntry.slice("--format=".length);
  } else if (fmtIdx !== -1 && fmtIdx + 1 < rest.length && !rest[fmtIdx + 1]!.startsWith("--")) {
    formatValue = rest[fmtIdx + 1];
  }
  if (formatValue !== undefined && formatValue !== "text" && formatValue !== "json") {
    process.stderr.write(
      `pr-shepherd: ${command}: invalid --format value: "${formatValue}". Expected "text" or "json".\n`,
    );
    process.exitCode = EXIT.USAGE;
    return;
  }

  const jsonOut = formatValue === "json";
  const dryRun = rest.includes("--dry-run");
  // Skip values consumed by --format <value> so they aren't positionals.
  const flagConsumedIndices = new Set<number>();
  if (fmtIdx !== -1 && fmtIdx + 1 < rest.length && !rest[fmtIdx + 1]!.startsWith("--")) {
    flagConsumedIndices.add(fmtIdx);
    flagConsumedIndices.add(fmtIdx + 1);
  }
  const positionals = rest.filter((a, i) => !flagConsumedIndices.has(i) && !a.startsWith("--"));
  if (positionals.length > 1) {
    process.stderr.write(
      `pr-shepherd: ${command}: too many positional arguments (expected at most 1, got ${positionals.length})\n`,
    );
    process.exitCode = EXIT.USAGE;
    return;
  }
  const value = positionals[0];

  const result = await runClean({ variant: variant as CleanVariant, value, dryRun });

  if (!result.ok) {
    process.stderr.write(`pr-shepherd: ${command}: ${result.error}\n`);
    process.exitCode = EXIT.SOFTWARE;
    return;
  }

  process.stdout.write(
    jsonOut ? `${JSON.stringify(result, null, 2)}\n` : `${formatCleanResult(result)}\n`,
  );
}
