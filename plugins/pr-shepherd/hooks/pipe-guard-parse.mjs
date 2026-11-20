// A small, conservative shell reader for the pipe guard. It answers one question:
// is a pr-shepherd command's stdout certainly piped into another command? Anything
// it cannot read with confidence (unbalanced quotes, odd syntax) answers "no".

import { maskShell } from "./poll-guard-shell.mjs";

const ASSIGNMENT = /^[A-Za-z_]\w*=/;
const LEADING_KEYWORDS = new Set([
  "!",
  "time",
  "then",
  "do",
  "else",
  "elif",
  "if",
  "while",
  "until",
]);
const FLOW = "flow";
const PIPE = "pipe";

/** True when every quote, backtick, and `$(…)` in `text` is closed. Heredoc text may defeat it, which only allows. */
export function isBalanced(text) {
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const top = stack.at(-1);
    if (c === "\\") i++;
    else if (top === "d") {
      if (c === '"') stack.pop();
      else if (c === "`") stack.push("b");
      else if (c === "$" && text[i + 1] === "(") {
        stack.push("p");
        i++;
      }
    } else if (c === "'") {
      const end = singleQuoteEnd(text, i);
      if (end === -1) return false;
      i = end;
    } else if (c === "$" && text[i + 1] === "'") {
      const end = singleQuoteEnd(text, i + 1, true);
      if (end === -1) return false;
      i = end;
    } else if (c === '"') stack.push("d");
    else if (c === "`") {
      if (top === "b") stack.pop();
      else stack.push("b");
    } else if (c === "(") stack.push("p");
    else if (c === ")") {
      if (top === "p") stack.pop();
    } else if (c === "#" && (i === 0 || /[\s;&|(]/.test(text[i - 1]))) {
      const end = text.indexOf("\n", i);
      if (end === -1) break;
      i = end;
    }
  }
  return stack.length === 0;
}

/** Index of the quote closing the one at `from`, or -1. `$'…'` honors backslash escapes. */
function singleQuoteEnd(text, from, escapes = false) {
  for (let j = from + 1; j < text.length; j++) {
    if (escapes && text[j] === "\\") j++;
    else if (text[j] === "'") return j;
  }
  return -1;
}

/**
 * Splits masked text into simple commands. Each is `{ text, term }`, where `term` is
 * "pipe" when a single `|` or `|&` follows it directly and "flow" for any other
 * boundary. Redirections such as `2>&1`, `&>f`, and `>|f` are not boundaries.
 */
export function splitCommands(masked) {
  const parts = [];
  let start = 0;
  const cut = (at, term, width = 1) => {
    parts.push({ text: masked.slice(start, at), term });
    start = at + width;
  };
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    const prev = masked[i - 1];
    const next = masked[i + 1];
    if (c === ";" || c === "\n" || c === "(" || c === ")" || c === "`") cut(i, FLOW);
    else if (c === "&") {
      if (next === "&") {
        cut(i, FLOW, 2);
        i++;
      } else if (prev !== "<" && prev !== ">" && next !== ">") cut(i, FLOW);
    } else if (c === "|" && prev !== ">") {
      if (next === "|") {
        cut(i, FLOW, 2);
        i++;
      } else if (next === "&") {
        cut(i, PIPE, 2);
        i++;
      } else cut(i, PIPE);
    }
  }
  parts.push({ text: masked.slice(start), term: FLOW });
  return parts;
}

/** The command's words after leading keywords and `VAR=value` assignments. */
function commandWords(text) {
  const words = text.split(/\s+/).filter(Boolean);
  while (words.length > 0 && (ASSIGNMENT.test(words[0]) || LEADING_KEYWORDS.has(words[0]))) {
    words.shift();
  }
  return words;
}

const isShepherd = (word) => /^pr-shepherd(?:@\S*)?$/.test(word);

/**
 * Whether the words run pr-shepherd: `pr-shepherd`, a path ending `/pr-shepherd`,
 * or `npx [-flags] pr-shepherd` / `pnpm exec [-flags] pr-shepherd`.
 */
export function runsShepherd(words) {
  const [first, ...rest] = words;
  if (first === undefined) return false;
  if (first === "pr-shepherd" || first.endsWith("/pr-shepherd")) return true;
  let args;
  if (first === "npx") args = rest;
  else if (first === "pnpm" && rest[0] === "exec") args = rest.slice(1);
  else return false;
  while (args[0]?.startsWith("-")) args.shift();
  return args[0] !== undefined && isShepherd(args[0]);
}

/** True when a pr-shepherd invocation in `command` is certainly followed by a pipe. */
export function pipesShepherd(command) {
  if (typeof command !== "string" || !isBalanced(command)) return false;
  // A backslash-newline joins lines. Blank it (odd backslash runs only) before masking.
  const joined = command.replace(/(\\+)\n/g, (m, run) =>
    run.length % 2 === 1 ? `${run.slice(0, -1)}  ` : m,
  );
  return splitCommands(maskShell(joined)).some(
    ({ text, term }) => term === PIPE && runsShepherd(commandWords(text)),
  );
}
