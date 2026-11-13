import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const HEADER =
  "### :white_check_mark: **Snyk checks have passed. No issues have been found so far.**";
const TABLE_HEAD = /^\| Status \| Scan Engine \|.* Total \(0\) \|$/;
const SEPARATOR = /^\|(?:---\|)+$/;
/** A scan-engine row: passed, every severity 0, and a "0 issues" link. */
const CLEAN_ROW =
  /^\| :white_check_mark: \| [A-Za-z ]+\| 0 \| 0 \| 0 \| 0 \| \[ 0 issues\]\(https:\/\/app\.snyk\.io\/[^\s)]*\) \|$/;
const PLUGIN_FOOTER = /^:computer: Catch issues earlier using the plugins for /;

/**
 * Snyk's PR-check summary when every scan passed with zero issues. Any other header, a row with a
 * non-zero count, or a line outside the table and the IDE-plugin footer keeps it visible.
 */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["snyk-io"], ["pr-comment"])) return null;
  const [header, blank, head, separator, ...rest] = item.body.trim().split("\n");
  const framed = `${header}\n${blank}` === `${HEADER}\n`;
  if (!framed || !TABLE_HEAD.test(String(head)) || !SEPARATOR.test(String(separator))) return null;
  const rows = rest.filter((line) => line.startsWith("|"));
  const tail = rest.slice(rows.length);
  if (rows.length === 0 || !rows.every((row) => CLEAN_ROW.test(row))) return null;
  if (!tail.every((line) => line === "" || PLUGIN_FOOTER.test(line))) return null;
  return { autoResolve: true, suppress: true, reason: "Snyk no-issues summary" };
};

export default rule;
