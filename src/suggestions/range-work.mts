const MAX_ADJACENT_SCAN_WORK = 1_000_000;

function estimatedScanWork(replacementLineCount: number, availableLineCount: number): number {
  const changedWindowLimit = Math.min(availableLineCount, replacementLineCount);
  return replacementLineCount * changedWindowLimit ** 2;
}

export type ChargeScanWork = (replacementLineCount: number, availableLineCount: number) => boolean;

export function createScanWorkBudget(): ChargeScanWork {
  let work = 0;
  return (replacementLineCount, availableLineCount) => {
    work += estimatedScanWork(replacementLineCount, availableLineCount);
    return work > MAX_ADJACENT_SCAN_WORK;
  };
}
