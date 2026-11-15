/** A rough human duration: whole seconds under a minute, else whole minutes. */
export function formatDurationApprox(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const mins = Math.floor(s / 60);
  return `${mins} minute${mins === 1 ? "" : "s"}`;
}
