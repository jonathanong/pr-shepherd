export type BacktickRun = { escaped: boolean; index: number; length: number; quoted: boolean };

export function backtickRuns(line: string): BacktickRun[] {
  const runs: BacktickRun[] = [];
  let inTag = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    if (!inTag && line[i] === "<" && /^\/?[A-Za-z]/.test(line.slice(i + 1))) inTag = true;
    else if (inTag && quote) {
      if (line[i] === quote) quote = null;
    } else if (inTag && (line[i] === '"' || line[i] === "'")) quote = line[i] === '"' ? '"' : "'";
    else if (inTag && line[i] === ">") inTag = false;
    if (line[i] !== "`") continue;
    let slashes = 0;
    while (line[i - slashes - 1] === "\\") slashes++;
    let end = i;
    while (line[end] === "`") end++;
    runs.push({ escaped: slashes % 2 === 1, index: i, length: end - i, quoted: quote !== null });
    i = end - 1;
  }
  return runs;
}

export function nextBacktickRun(
  runs: BacktickRun[],
  offset: number,
  length?: number,
): BacktickRun | undefined {
  return runs.find((run) => run.index >= offset && (length === undefined || run.length === length));
}

export function nextCodeOpener(runs: BacktickRun[], offset: number): BacktickRun | undefined {
  return runs.find((run) => run.index >= offset && !run.quoted);
}
