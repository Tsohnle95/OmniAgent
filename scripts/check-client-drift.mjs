import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const pinned = pkg.dependencies["@opencode-ai/client"];

const buildOf = (version) => {
  const match = /(\d+)$/.exec(version.trim());
  return match ? Number(match[1]) : null;
};

let tags;
try {
  tags = JSON.parse(
    execFileSync("npm", ["view", "@opencode-ai/client", "dist-tags", "--json"], {
      encoding: "utf8",
      timeout: 30_000
    })
  );
} catch (error) {
  console.error(`client:drift could not reach the npm registry: ${error.message}`);
  process.exit(2);
}

const pinnedBuild = buildOf(pinned);
const report = ["beta", "next", "dev"]
  .map((tag) => ({ tag, version: tags[tag], build: buildOf(tags[tag] ?? "") }))
  .filter((entry) => entry.version && entry.build !== null);

console.log(`pinned @opencode-ai/client ${pinned} (build ${pinnedBuild})`);
const beta = report.find((entry) => entry.tag === "beta");
for (const entry of report) {
  const delta = entry.build - pinnedBuild;
  const state = delta > 0 ? `${delta} builds ahead` : delta === 0 ? "current" : "older";
  console.log(`${entry.tag.padEnd(5)} ${entry.version} (${state})`);
}

if (!beta || beta.build > pinnedBuild) {
  console.error(
    "\nThe published beta line is ahead of the pinned client. Review the changelog, bump the pin, and raise minSupportedServerBuild in src/main/opencode.ts if the event contract moved."
  );
  process.exit(1);
}
console.log("\npinned client matches the newest published beta.");
