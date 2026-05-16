import type { IterateResult } from "../types.mts";
import type { CliRunner } from "./runner.mts";
import { iterateActionToExitCode } from "./exit-codes.mts";
import { formatIterateResult, projectIterateLean, projectIterateVerbose } from "./formatters.mts";

export interface EmitIterateResultOpts {
  format: "text" | "json";
  verbose: boolean;
  readyDelaySuffix?: string;
  runner?: CliRunner;
}

export function emitIterateResult(result: IterateResult, opts: EmitIterateResultOpts): void {
  const projectionOpts = {
    readyDelaySuffix: opts.readyDelaySuffix,
    runner: opts.runner,
  };
  if (opts.format === "json") {
    const output = opts.verbose
      ? projectIterateVerbose(result, projectionOpts)
      : projectIterateLean(result, projectionOpts);
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } else {
    const text = formatIterateResult(result, { verbose: opts.verbose, ...projectionOpts });
    process.stdout.write(`${text}\n`);
  }
  process.exitCode = iterateActionToExitCode(result.action);
}
