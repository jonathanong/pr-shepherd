const MERGE_STRATEGY_FLAGS = new Map([
  ["--merge", "merge"],
  ["-m", "merge"],
  ["--squash", "squash"],
  ["-s", "squash"],
  ["--rebase", "rebase"],
  ["-r", "rebase"],
]);

/** Return active merge strategies while validating compound strategy syntax. */
export function findMergeStrategies(args: string[]): string[] {
  const strategies: string[] = [];
  for (const arg of args) {
    const exact = MERGE_STRATEGY_FLAGS.get(arg);
    if (exact) {
      strategies.push(exact);
      continue;
    }

    const longAssignment = /^(--merge|--squash|--rebase)=(.*)$/.exec(arg);
    const shortAssignment = /^(-[msr])=(.*)$/.exec(arg);
    const assignment = longAssignment ?? shortAssignment;
    if (assignment) {
      if (assignment[2] !== "true" && assignment[2] !== "false") {
        throw new Error(`Invalid config: merge.commandArgs strategy ${arg} must use true or false`);
      }
      if (assignment[2] === "true") {
        strategies.push(MERGE_STRATEGY_FLAGS.get(assignment[1]) as string);
      }
      continue;
    }

    const shortBundle = /^-([dmrs]{2,})$/.exec(arg);
    if (shortBundle) {
      for (const flag of shortBundle[1]) {
        const strategy = MERGE_STRATEGY_FLAGS.get(`-${flag}`);
        if (strategy) strategies.push(strategy);
      }
      continue;
    }

    if (/^-[dmrs].+/.test(arg)) {
      throw new Error(
        `Invalid config: merge.commandArgs cannot safely parse compound short option ${arg}; use separate flags or long options`,
      );
    }
  }
  return strategies;
}
