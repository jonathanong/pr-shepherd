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
  const text = expandedText(argText(cmd));
  return new RegExp(`\\$(?:${name}\\b|\\{${name}[}:#%/])`).test(text);
}

/** `text` without its single-quoted spans. An apostrophe inside double quotes is literal. */
function expandedText(text) {
  let out = "";
  let dq = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      out += text.slice(i, i + 2);
      i++;
    } else if (c === "'" && !dq) {
      const end = text.indexOf("'", i + 1);
      i = end === -1 ? text.length : end;
    } else {
      if (c === '"') dq = !dq;
      out += c;
    }
  }
  return out;
}

/** The arguments of a `curl` command without its output file (`-o F`, `-oF`, `-sSo F`, `--output F`). */
export const curlArgs = (cmd) =>
  argText(cmd).replace(/(?:^|\s)(?:-[a-zA-Z]*o\s*|--output(?:=|\s+))\S+/g, " ");
