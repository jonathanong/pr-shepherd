// A small, deliberately incomplete shell scanner for the poll guard. It finds the
// simple commands a shell would run and the loops they run in. Text a command only
// passes around (quoted strings, comments, heredoc bodies) is masked, so a word in
// it is never mistaken for a command. Command substitutions inside double quotes
// stay visible, because the shell runs them.

const HIDDEN = "\0";
const SEPARATORS = /[;&|\n(){}`]/;
const WRAPPERS = new Set([
  "!",
  "time",
  "nohup",
  "exec",
  "sudo",
  "command",
  "builtin",
  "env",
  "npx",
]);
const KEYWORDS = new Set(["do", "then", "else", "elif", "if"]);

/**
 * Masks quoted text with NUL and comments and heredoc bodies with spaces, preserving
 * UTF-16 length. Quoted text stays one argument; comments and heredocs disappear.
 */
export function maskShell(text) {
  const out = text.split("");
  const stack = [{ mode: "code", depth: 0 }];
  let heredocs = [];
  const hide = (from, to, fill = HIDDEN) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== "\n") out[k] = fill;
  };
  for (let i = 0; i < text.length; i++) {
    const top = stack.at(-1);
    const c = text[i];
    if (top.mode === "dq") {
      if (c === "\\") {
        hide(i, i + 2);
        i++;
      } else if (c === '"') {
        hide(i, i + 1);
        stack.pop();
      } else if (c === "$" && text[i + 1] === "(") {
        stack.push({ mode: "code", depth: 1 });
        i++;
      } else if (c === "`") stack.push({ mode: "bq", depth: 0 });
      else hide(i, i + 1);
      continue;
    }
    if (c === "`" && top.mode === "bq") {
      stack.pop();
      continue;
    }
    if (c === "\\") {
      hide(i, i + 2);
      i++;
    } else if (c === "'") {
      const end = text.indexOf("'", i + 1);
      const stop = end === -1 ? text.length : end + 1;
      hide(i, stop);
      i = stop - 1;
    } else if (c === '"') {
      hide(i, i + 1);
      stack.push({ mode: "dq", depth: 0 });
    } else if (c === "#" && (i === 0 || /[\s;&|(]/.test(text[i - 1]))) {
      const end = text.indexOf("\n", i);
      hide(i, end === -1 ? text.length : end, " ");
      i = (end === -1 ? text.length : end) - 1;
    } else if (c === "(" && top.depth > 0) top.depth++;
    else if (c === ")" && top.depth > 0 && --top.depth === 0) stack.pop();
    else if (c === "<" && text[i + 1] === "<" && text[i + 2] !== "<") {
      const m = /^<<(-?)\s*(['"]?)([\w.-]+)\2/.exec(text.slice(i));
      if (m) heredocs.push({ strip: m[1] === "-", tag: m[3] });
    } else if (c === "\n" && heredocs.length > 0) {
      i = skipHeredocs(text, i + 1, heredocs, hide) - 1;
      heredocs = [];
    }
  }
  return out.join("");
}

/** Hides each pending heredoc body after a newline; returns the index after the last one. */
function skipHeredocs(text, start, heredocs, hide) {
  let at = start;
  for (const { strip, tag } of heredocs) {
    const lines = /[^\n]*(?:\n|$)/gy;
    lines.lastIndex = at;
    let end = text.length;
    for (let m = lines.exec(text); m && m[0] !== ""; m = lines.exec(text)) {
      const line = m[0].replace(/\n$/, "");
      if ((strip ? line.replace(/^\t+/, "") : line) === tag) {
        end = m.index + m[0].length;
        break;
      }
    }
    hide(at, end, " ");
    at = end;
  }
  return at;
}

/**
 * Variables a loop steps through: `for VAR in …` or `while read [-r] VAR…`. A
 * command that uses one iterates over a list instead of re-reading one state.
 */
function loopVars(keyword, words) {
  if (keyword === "for") return words[0] ? [words[0].word] : [];
  if (words[0]?.word !== "read") return [];
  return words.slice(1).flatMap((w) => (/^\w+$/.test(w.word) ? [w.word] : []));
}

/**
 * The simple commands in `text`, in order. Each has its `words` (masked, with
 * offsets into `text`), the raw `text` of the command, the loops it runs in
 * (`{ id, vars }`), and whether a `watch` wrapper repeats it.
 */
export function simpleCommands(text) {
  const masked = maskShell(text);
  const commands = [];
  const open = [];
  let nextLoop = 0;
  let start = 0;
  for (let i = 0; i <= masked.length; i++) {
    if (i < masked.length && !SEPARATORS.test(masked[i])) continue;
    const words = [...masked.slice(start, i).matchAll(/\S+/g)].map((m) => ({
      word: m[0],
      raw: text.slice(start + m.index, start + m.index + m[0].length),
      at: start + m.index,
    }));
    start = i + 1;
    let watched = false;
    let wrapped = false;
    while (words.length > 0) {
      const w = words[0].word;
      if (KEYWORDS.has(w) || /^\w+=/.test(w) || (w.startsWith("-") && wrapped)) {
        words.shift();
      } else if (WRAPPERS.has(w)) {
        wrapped = true;
        words.shift();
      } else if (w === "timeout") {
        // `timeout [-s SIG] [-k D] DURATION cmd…`
        words.shift();
        while (words[0]?.word.startsWith("-")) {
          if (/^-[sk]$/.test(words.shift().word)) words.shift();
        }
        words.shift();
        wrapped = true;
      } else if (w === "watch") {
        watched = wrapped = true;
        words.shift();
        while (words[0]?.word.startsWith("-")) {
          const flag = words.shift().word;
          if (/^(?:-n|--interval)$/.test(flag)) words.shift();
        }
      } else if (w === "while" || w === "until" || w === "for") {
        words.shift();
        open.push({ id: nextLoop++, vars: loopVars(w, words) });
        if (w === "for") words.length = 0;
      } else if (w === "done") {
        open.pop();
        words.length = 0;
      } else break;
    }
    if (words.length === 0) continue;
    const end = i;
    commands.push({ words, text: text.slice(words[0].at, end), loops: [...open], watched });
  }
  return commands;
}

/** The text of the quoted argument that starts `rest`, or null. */
export function leadingQuoted(rest) {
  const quote = rest.trimStart()[0];
  if (quote !== "'" && quote !== '"') return null;
  const body = rest.trimStart().slice(1);
  const end = quote === "'" ? body.indexOf("'") : body.search(/(?<!\\)"/);
  return end === -1 ? null : body.slice(0, end);
}
