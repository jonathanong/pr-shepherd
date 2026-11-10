import { execFileSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { setTimeout as sleep } from "timers/promises";

// Runs after `npm publish`: the plugin lockfile can only pin a version the registry serves.
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const pluginDir = "plugins/pr-shepherd";
const manifestPath = `${pluginDir}/package.json`;

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.dependencies["pr-shepherd"] = version;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
// --prefer-online revalidates cached registry metadata on every attempt.
const args = [
  "install",
  "--package-lock-only",
  "--ignore-scripts",
  "--no-audit",
  "--no-fund",
  "--prefer-online",
];
for (let attempt = 1; ; attempt++) {
  try {
    execFileSync(npm, args, { cwd: pluginDir, stdio: "inherit" });
    break;
  } catch (error) {
    if (attempt === 8) throw error;
    // The registry can take minutes to serve a version it just accepted: the
    // v1.2.0 release still got ETARGET after 2.5 minutes. These waits add up to 7.
    await sleep(attempt * 15_000);
  }
}
