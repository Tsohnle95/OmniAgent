#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");
const exists = async (file) => {
  try {
    await stat(path.join(root, file));
    return true;
  } catch {
    return false;
  }
};

const errors = [];
const check = (ok, message) => {
  if (!ok) errors.push(message);
};

const todoText = await read("TODO.md");
const openItems = [];
let inDocsSection = false;
for (const line of todoText.split("\n")) {
  if (line.startsWith("## Docs")) {
    inDocsSection = true;
    continue;
  }
  if (inDocsSection) continue;
  const match = line.match(/^- \[ \]\s+(.+)$/);
  if (match) openItems.push(match[1].trim());
}

let plan;
try {
  plan = JSON.parse(await read("dispatch-plan.json"));
} catch {
  console.error("dispatch-plan.json is missing or not valid JSON");
  process.exit(1);
}

const items = Array.isArray(plan?.items) ? plan.items : [];
check(items.length > 0, "plan must contain an items array");
check(items.length === openItems.length, `TODO.md has ${openItems.length} dispatchable items, plan covers ${items.length}`);

const waveFiles = new Map();
const itemWaves = [];
for (let index = 0; index < items.length; index += 1) {
  const item = items[index] ?? {};
  const label = `item ${index + 1} ("${item.todo ?? "?"}")`;
  const todoLine = openItems[index] ?? "";
  check(
    typeof item.todo === "string" && item.todo.length > 0 && todoLine.toLowerCase().includes(item.todo.toLowerCase()),
    `${label}: "todo" must be text contained in TODO.md line ${index + 1}`
  );
  const files = Array.isArray(item.files) ? item.files : [];
  check(files.length > 0, `${label}: files list is empty; explore and scope the item before dispatch`);
  check(Number.isInteger(item.wave) && item.wave >= 1, `${label}: wave must be a positive integer`);
  itemWaves.push(item.wave);
  for (const file of files) {
    if (typeof file !== "string") {
      check(false, `${label}: file paths must be strings`);
      continue;
    }
    check(await exists(file), `${label}: unknown path "${file}"`);
    const owner = waveFiles.get(`${item.wave}:${file}`);
    check(
      owner === undefined,
      `${label}: "${file}" is also assigned to item ${owner + 1} in wave ${item.wave}; move one of them to another wave`
    );
    if (owner === undefined) waveFiles.set(`${item.wave}:${file}`, index);
  }
  for (const dep of Array.isArray(item.dependsOn) ? item.dependsOn : []) {
    check(Number.isInteger(dep) && dep >= 0 && dep < items.length, `${label}: dependsOn ${dep} does not reference a plan item`);
    check(
      Number.isInteger(dep) && (items[dep]?.wave ?? Number.POSITIVE_INFINITY) < item.wave,
      `${label}: dependsOn item ${dep + 1} must be in an earlier wave`
    );
  }
}

const waves = [...new Set(itemWaves)].sort((a, b) => a - b);
check(waves.length > 0 && waves[0] === 1, "waves must start at 1");
for (let index = 1; index < waves.length; index += 1) {
  check(waves[index] === waves[index - 1] + 1, `wave gap between ${waves[index - 1]} and ${waves[index]}`);
}

if (errors.length > 0) {
  console.error(`dispatch plan invalid (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`dispatch plan OK: ${items.length} items across ${waves.length} wave${waves.length === 1 ? "" : "s"}`);
