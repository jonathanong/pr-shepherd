/**
 * Machine-readable JSON reporter.
 *
 * Slash commands parse this output to extract IDs, status, and actionable items
 * without string-scraping the human-readable text reporter.
 */

import type { ShepherdReport } from "../types.mts";

export function formatJson(report: ShepherdReport): string {
  return JSON.stringify(report, null, 2);
}
