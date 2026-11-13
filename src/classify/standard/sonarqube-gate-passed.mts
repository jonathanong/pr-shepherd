import type { ClassifyRule } from "../types.mts";
import { isBotItem } from "./author.mts";

const STATIC = "https://sonarsource.github.io/sonarcloud-github-static-resources/v2";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const HEADER = new RegExp(
  `^## \\[!\\[Quality Gate Passed\\]\\(${esc(STATIC)}/checks/QualityGateBadge/qg-passed-20px\\.png 'Quality Gate Passed'\\)\\]\\(https://sonarcloud\\.io/[^\\s)]*\\) \\*\\*Quality Gate passed\\*\\*$`,
);
/** One metric line with SonarQube's passed (or accepted) icon. */
const METRIC = new RegExp(
  `^!\\[\\]\\(${esc(STATIC)}/common/(?:passed|accepted)-16px\\.png ''\\) \\[([^\\]\\n]+)\\]\\(https://sonarcloud\\.io/[^\\s)]*\\)$`,
);
const COUNTS = /^(?:0 New issues|\d+ Accepted issues|0 Security Hotspots)$/;
const PERCENT = /^\d+(?:\.\d+)?% (?:Coverage|Duplication) on New Code$/;
const FOOTER = /^\[See analysis details on SonarQube Cloud\]\(https:\/\/sonarcloud\.io\/[^\s)]*\)$/;

/**
 * SonarQube Cloud's PR decoration when the quality gate passed with no new issues and no security
 * hotspots. A failed gate, a non-zero count, or any line outside the fixed layout keeps it visible.
 */
const rule: ClassifyRule = (item) => {
  if (!isBotItem(item, ["sonarqubecloud"], ["pr-comment"])) return null;
  const lines = item.body
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "" && line !== "<!-- sqra-placement-anchor -->");
  const [header, ...rest] = lines;
  if (!HEADER.test(header ?? "") || !FOOTER.test(rest.pop() ?? "")) return null;
  const ok = rest.every((line) => {
    if (line === "Issues" || line === "Measures") return true;
    const label = METRIC.exec(line)?.[1];
    return label !== undefined && (COUNTS.test(label) || PERCENT.test(label));
  });
  return ok ? { autoResolve: true, suppress: true, reason: "SonarQube quality gate passed" } : null;
};

export default rule;
