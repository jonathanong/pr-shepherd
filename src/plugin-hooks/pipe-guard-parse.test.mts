import { describe, expect, it } from "vitest";

import {
  isBalanced,
  pipesShepherd,
  runsShepherd,
  splitCommands,
} from "../../plugins/pr-shepherd/hooks/pipe-guard-parse.mjs";

const BLOCK: [string, string][] = [
  ["plain pipe", "pr-shepherd 1 | tail"],
  ["npx without spaces around pipe", "npx pr-shepherd 1 --until-terminal|head -5"],
  ["npx --yes", "npx --yes pr-shepherd 1 | tail -40"],
  ["npx versioned", "npx pr-shepherd@latest 1 | grep x"],
  ["pnpm exec", "pnpm exec pr-shepherd 1 | tail"],
  ["assignment prefix", "FOO=1 pr-shepherd 1 | tee x"],
  ["quoted assignment prefix", 'FOO="a b" pr-shepherd 1 | tee x'],
  ["after &&", "cd x && pr-shepherd 1 2>&1 | tail"],
  ["after ;", "cd x; pr-shepherd 1 | tail"],
  ["after ||", "false || pr-shepherd 1 | tail"],
  ["pipe-stderr", "pr-shepherd 1 |& cat"],
  ["path command", "/usr/local/bin/pr-shepherd 1 | tail"],
  ["relative path command", "./node_modules/.bin/pr-shepherd 1 | tail"],
  ["middle of a pipeline", "echo x | pr-shepherd 1 | tail"],
  ["inside $()", 'out=$(pr-shepherd 1 | tail -5); echo "$out"'],
  ["inside backticks", "x=`pr-shepherd 1 | tail`"],
  ["inside double-quoted $()", 'echo "$(pr-shepherd 1 | tail)"'],
  ["multiline with continuation", "pr-shepherd 1 \\\n  --until-terminal | tail"],
  ["second line", "echo hi\npr-shepherd 1 | tail"],
  ["after a comment line", "# note\npr-shepherd 1 | tail"],
  ["trailing comment with apostrophe", "pr-shepherd 1 | tail # don't"],
  ["in an if condition", "if pr-shepherd 1 | grep -q x; then echo y; fi"],
  ["background then pipe", "sleep 1 & pr-shepherd 1 | tail"],
  ["stderr redirect then pipe", "pr-shepherd 1 2>/dev/null | head"],
  ["heredoc earlier, pipe after", "cat <<EOF\nhi\nEOF\npr-shepherd 1 | tail"],
];

const ALLOW: [string, string][] = [
  ["no pipe", "pr-shepherd 1 --until-terminal"],
  ["pipe into pr-shepherd", "echo x | pr-shepherd apply"],
  ["redirect to file", "pr-shepherd 1 > out.txt"],
  ["merge stderr", "pr-shepherd 1 2>&1"],
  ["merge both to file", "pr-shepherd 1 &> out.txt"],
  ["clobber redirect", "pr-shepherd 1 >| out.txt"],
  ["double pipe", "pr-shepherd 1 || echo failed"],
  ["double pipe no spaces", "pr-shepherd 1||echo failed"],
  ["and then pipe elsewhere", "pr-shepherd 1 && echo done | cat"],
  ["semicolon then pipe elsewhere", "pr-shepherd 1; ls | wc -l"],
  ["background", "pr-shepherd 1 & echo started | cat"],
  ["name with suffix", "pr-shepherd-foo 1 | tail"],
  ["path with suffix", "/bin/pr-shepherd-foo 1 | tail"],
  ["name with prefix", "my-pr-shepherd 1 | tail"],
  ["grep for the name", "grep pr-shepherd file | wc -l"],
  ["cat piped to grep", 'cat docs | grep "pr-shepherd |"'],
  ["double-quoted mention", 'echo "pr-shepherd | tail"'],
  ["single-quoted mention", "gh pr comment 1 --body 'pr-shepherd | x'"],
  ["commit message", 'git commit -m "docs: do not run pr-shepherd 1 | tail"'],
  ["heredoc body", "cat <<'EOF'\npr-shepherd 1 | tail\nEOF"],
  ["heredoc then other pipe", "cat <<EOF | wc -l\npr-shepherd 1 | tail\nEOF"],
  ["comment", "echo hi # pr-shepherd 1 | tail"],
  ["whole-line comment", "# pr-shepherd 1 | tail\nls"],
  ["pipe inside $() not after pr-shepherd", "pr-shepherd $(echo 1 | head -1)"],
  ["pipe inside $() then redirect", "pr-shepherd $(git rev-parse HEAD | cut -c1-7) > out"],
  ["escaped pipe", "pr-shepherd 1 \\| tail"],
  ["quoted command word", '"pr-shepherd" 1 | tail'],
  ["subshell piped as a whole", "(pr-shepherd 1) | tail"],
  ["unbalanced single quote", "pr-shepherd 1 | echo 'oops"],
  ["unbalanced double quote", 'pr-shepherd 1 | echo "oops'],
  ["unbalanced backtick", "pr-shepherd 1 | echo `oops"],
  ["unbalanced $(", "pr-shepherd 1 | echo $(oops"],
  ["other npx package", "npx other-tool 1 | tail"],
  ["npx without a package", "npx | tail"],
  ["pnpm other subcommand", "pnpm install pr-shepherd | tail"],
  ["bare npm run", "npm run pr-shepherd | tail"],
  ["empty command", ""],
  ["assignment only", "FOO=1 | tail"],
  ["ANSI-C quoted mention", "echo $'it\\'s pr-shepherd | x'"],
];

describe("pipesShepherd", () => {
  it.each(BLOCK)("blocks: %s", (_name, command) => {
    expect(pipesShepherd(command)).toBe(true);
  });

  it.each(ALLOW)("allows: %s", (_name, command) => {
    expect(pipesShepherd(command)).toBe(false);
  });

  it("allows a non-string command", () => {
    expect(pipesShepherd(undefined)).toBe(false);
    expect(pipesShepherd(["pr-shepherd", "1"])).toBe(false);
  });

  it("keeps an even backslash run before a newline as a line break", () => {
    expect(pipesShepherd("pr-shepherd 1 \\\\\n| tail")).toBe(false);
  });
});

describe("isBalanced", () => {
  it.each([
    ["", true],
    ["echo 'a \"b\"' \"c 'd'\"", true],
    ['echo "a $(echo "b") c"', true],
    ["echo `a`", true],
    ['echo "a `b` c"', true],
    ["echo $'a\\'b'", true],
    ["echo \\' ok", true],
    ["case x in a) echo;; esac", true],
    ["echo # don't", true],
    ["echo 'a", false],
    ["echo $'a", false],
    ['echo "a', false],
    ["echo $(a", false],
  ])("%j -> %s", (text, expected) => {
    expect(isBalanced(text)).toBe(expected);
  });
});

describe("splitCommands and runsShepherd", () => {
  it("labels boundaries", () => {
    expect(splitCommands("a | b |& c || d && e; f & g > x 2>&1").map((p) => p.term)).toEqual([
      "pipe",
      "pipe",
      "flow",
      "flow",
      "flow",
      "flow",
      "flow",
    ]);
  });

  it("matches only pr-shepherd command words", () => {
    expect(runsShepherd([])).toBe(false);
    expect(runsShepherd(["npx", "--yes", "pr-shepherd"])).toBe(true);
    expect(runsShepherd(["npx", "--yes"])).toBe(false);
    expect(runsShepherd(["pnpm", "exec", "-r", "pr-shepherd@1"])).toBe(true);
    expect(runsShepherd(["pnpm", "run", "pr-shepherd"])).toBe(false);
    expect(runsShepherd(["pr-shepherd-x"])).toBe(false);
  });
});
