// Argument helpers for the poll guard: what a command passes to the program it runs,
// as opposed to where it sends the output.

/**
 * The command's arguments without redirections, so `> "pulls-$i.json"` neither
 * names a PR endpoint nor uses a loop variable.
 */
export function argText(cmd) {
  const kept = [];
  for (let k = 0; k < cmd.words.length; k++) {
    const raw = cmd.words[k].raw;
    if (/^\d*(?:[<>]|>>|&>)$/.test(raw)) k++;
    else if (!/^\d*(?:[<>]|&>)/.test(raw)) kept.push(raw);
  }
  return kept.join(" ");
}

/**
 * Whether the command's arguments use loop variable `name` as the shell expands
 * it. Single-quoted text, such as a jq program's own `$pr`, is not expanded.
 */
export function usesLoopVar(cmd, name) {
  const text = argText(cmd).replace(/'[^']*'/g, "");
  return new RegExp(`\\$(?:${name}\\b|\\{${name}[}:#%/])`).test(text);
}
