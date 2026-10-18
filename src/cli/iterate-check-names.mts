import type { IterateResult } from "../types.mts";
import { capList, moreSuffix } from "../util/cap-list.mts";

/** Backticked inline name list; lean output caps it and appends `+N more`. */
export function formatNameList(names: readonly string[], verbose: boolean): string {
  const { shown, hidden } = verbose ? { shown: names, hidden: 0 } : capList(names);
  return shown.map((n) => "`" + n + "`").join(", ") + moreSuffix(hidden);
}

/** `**ignored**` and `**superseded**` header lines, omitted when their lists are empty. */
export function formatSuppressedNameLines(result: IterateResult, verbose: boolean): string[] {
  const lines: string[] = [];
  if (result.ignoredNames && result.ignoredNames.length > 0) {
    lines.push(`**ignored** ${formatNameList(result.ignoredNames, verbose)}`);
  }
  if (result.supersededNames && result.supersededNames.length > 0) {
    lines.push(`**superseded** ${formatNameList(result.supersededNames, verbose)}`);
  }
  return lines;
}
