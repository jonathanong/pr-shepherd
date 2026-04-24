/**
 * Machine-readable JSON reporter for shepherd check output.
 *
 * Slash commands parse this output to extract IDs, status, and actionable items
 * without string-scraping the human-readable text reporter.
 */

import type { ShepherdReport } from "../types.mts";
import { buildCheckInstructions } from "./check-instructions.mts";

export function formatJson(report: ShepherdReport): string {
  return JSON.stringify({ ...report, instructions: buildCheckInstructions(report) }, null, 2);
}
