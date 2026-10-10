import { runClean, type CleanVariant } from "../commands/clean.mts";
import { EXIT } from "../exit-codes.mts";
import { USAGE } from "./help.mts";
import { formatCleanResult } from "./formatters.mts";
import { rejectInvalidPollModeFlag, runInPollModeScope } from "./event-state-scope.mts";

const CLEAN_VARIANTS = new Set<string>(["pr", "branch", "current", "repo", "all"]);

export async function handleClean(
  args: string[],
  command: "admin clean" | "clean" = "admin clean",
): Promise<void> {
  const usage = command === "admin clean" ? USAGE["admin clean"] : USAGE.clean;
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
    if (a === "--poll-mode" || a.startsWith("--poll-mode=")) continue;
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

  if (rejectInvalidPollModeFlag(rest, command)) return;

  const jsonOut = formatValue === "json";
  const dryRun = rest.includes("--dry-run");
  // Skip values consumed by --format <value> / --poll-mode <value> so they aren't positionals.
  const flagConsumedIndices = new Set<number>();
  if (fmtIdx !== -1 && fmtIdx + 1 < rest.length && !rest[fmtIdx + 1]!.startsWith("--")) {
    flagConsumedIndices.add(fmtIdx);
    flagConsumedIndices.add(fmtIdx + 1);
  }
  const pollModeIdx = rest.indexOf("--poll-mode");
  if (pollModeIdx !== -1) {
    flagConsumedIndices.add(pollModeIdx);
    flagConsumedIndices.add(pollModeIdx + 1);
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

  // Event mode keeps its state under the durable state base; clean must target that same scope.
  const result = await runInPollModeScope(rest, () =>
    runClean({ variant: variant as CleanVariant, value, dryRun }),
  );

  if (!result.ok) {
    process.stderr.write(`pr-shepherd: ${command}: ${result.error}\n`);
    process.exitCode = EXIT.SOFTWARE;
    return;
  }

  process.stdout.write(
    jsonOut ? `${JSON.stringify(result, null, 2)}\n` : `${formatCleanResult(result)}\n`,
  );
}
