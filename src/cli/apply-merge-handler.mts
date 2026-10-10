import { EXIT, ShepherdError, errorToExitCode } from "../exit-codes.mts";
import { runApplyMerge, type ApplyMergeResult } from "../commands/apply-merge.mts";
import type { RestMergeAction } from "../github/rest-merge.mts";
import type { MergeMethod } from "../config/merge-method.mts";
import { getFlag, parseCommonArgs } from "./args.mts";
import { maybePrintHelp, USAGE } from "./help.mts";

const flags = new Set(["--require-sha", "--merge-action", "--method"]);
export async function handleApplyMerge(args: string[]): Promise<void> {
  if (maybePrintHelp(args, "apply merge")) return;
  try {
    const { prNumber, global, extra } = parseCommonArgs(args);
    for (let index = 0; index < extra.length; index += 1) {
      const arg = extra[index]!;
      const name = arg.split("=", 1)[0]!;
      if (!flags.has(name))
        throw new ShepherdError(`Unknown apply merge argument: ${arg}`, EXIT.USAGE);
      if (!arg.includes("=")) {
        if (!extra[index + 1] || extra[index + 1]!.startsWith("--"))
          throw new ShepherdError(`${name} requires a value`, EXIT.USAGE);
        index += 1;
      }
    }
    const requireSha = getFlag(extra, "--require-sha");
    const mergeAction = getFlag(extra, "--merge-action");
    if (requireSha === null || mergeAction === null) {
      process.stderr.write(`${USAGE["apply merge"]}\n`);
      process.exitCode = EXIT.USAGE;
      return;
    }
    const result = await runApplyMerge({
      prNumber,
      targetRepository: global.targetRepository,
      requireSha,
      mergeAction: mergeAction as RestMergeAction,
      mergeMethod: (getFlag(extra, "--method") ?? undefined) as MergeMethod | undefined,
    });
    process.stdout.write(
      `${global.format === "json" ? JSON.stringify(result, null, 2) : formatApplyMergeResult(result)}\n`,
    );
    process.exitCode =
      result.status === "pending"
        ? EXIT.WAIT
        : result.status === "failed"
          ? result.uncertain
            ? EXIT.TEMPFAIL
            : EXIT.UNAVAILABLE
          : EXIT.OK;
  } catch (error) {
    process.stderr.write(
      `pr-shepherd: apply merge: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = errorToExitCode(error);
  }
}

export function formatApplyMergeResult(result: ApplyMergeResult): string {
  const lines = [`PR: ${result.repo}#${result.pr}`, `status: ${result.status}`];
  if (result.uncertain) lines.push("uncertain: true");
  if (result.note) lines.push(`note: ${result.note}`);
  for (const [name, value] of Object.entries(result.details)) {
    if (value !== undefined)
      lines.push(`- ${name}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  }
  return lines.join("\n");
}
