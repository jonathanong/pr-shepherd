import { transportReadinessGaps } from "../../github/transport-evidence.mts";
import type { ShepherdReport } from "../../types.mts";

/** Transport readiness gaps for a report, using its branch policy to clear provable gaps. */
export function reportReadinessGaps(report: ShepherdReport) {
  return transportReadinessGaps(
    report,
    report.mergeStatus.mergeStateStatus,
    report.mergeStatus.mergeRequirements?.conversationsResolved.required,
  );
}
