#!/usr/bin/env node
// Verifies the project brain (AGENTS.md + docs/) matches the code.
// Exits non-zero on drift so CI and `npm run docs:check` catch staleness.

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFile(path.join(root, p), "utf8");
const exists = async (p) => {
  try {
    await stat(path.join(root, p));
    return true;
  } catch {
    return false;
  }
};

const errors = [];
const check = (ok, msg) => {
  if (!ok) errors.push(msg);
};

// ---------------------------------------------------------------- AGENTS.md

const agents = await read("AGENTS.md");
check(
  /npm run docs:check/.test(agents),
  "AGENTS.md must mention `npm run docs:check` in its definition of done"
);

for (const m of agents.matchAll(/^\| [^|`]+ \| `([^`|]+)` \|/gm)) {
  if (!(await exists(m[1]))) {
    check(false, `AGENTS.md module map lists ${m[1]} but the file does not exist`);
  }
}

const agentDocLinks = [...agents.matchAll(/`(docs\/[\w.-]+\.md)`/g)].map((m) => m[1]);
for (const d of new Set(agentDocLinks)) {
  if (!(await exists(d))) check(false, `AGENTS.md links ${d} but the file does not exist`);
}

if (/TODO\.md/.test(agents) && !(await exists("TODO.md"))) {
  check(false, "AGENTS.md references TODO.md but the file does not exist");
}

const readme = await read("README.md");
for (const d of [...readme.matchAll(/`(docs\/[\w.-]+\.md)`/g)].map((m) => m[1])) {
  if (!(await exists(d))) check(false, `README.md links ${d} but the file does not exist`);
}

// ----------------------------------------------------------- main/index.ts

const mainIndex = await read("src/main/index.ts");
const ipcChannels = [...mainIndex.matchAll(/ipcMain\.handle\("(shell:[\w-]+)"/g)].map((m) => m[1]);

const mainDoc = await read("docs/main.md");
const mainTable = [...mainDoc.matchAll(/^\| `(shell:[\w-]+)` \|/gm)].map((m) => m[1]);

for (const ch of ipcChannels) {
  check(mainTable.includes(ch), `docs/main.md IPC table is missing ${ch} (registered in src/main/index.ts)`);
}
for (const ch of mainTable) {
  check(ipcChannels.includes(ch), `docs/main.md lists ${ch} but it is not registered in src/main/index.ts`);
}

// ------------------------------------------------------------- opencode.ts

const opencodeSrc = await read("src/main/opencode.ts");
const classStart = opencodeSrc.indexOf("export class OpenShellBackend {");
const classBody = opencodeSrc.slice(classStart);
const methods = [...classBody.matchAll(/^\s{2}(?:private\s+)?(?:async\s+)?(\w+)\(/gm)].map((m) => {
  const lineStart = classBody.lastIndexOf("\n", m.index) + 1;
  const lineEnd = classBody.indexOf("\n", m.index);
  const line = classBody.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  return { name: m[1], isPrivate: /\bprivate\b/.test(line) };
});
const publicMethods = methods.filter((m) => !m.isPrivate).map((m) => m.name);

const methodDoc = [...mainDoc.matchAll(/^\| `(\w+)\([^)]*\)` \|/gm)].map((m) => m[1]);
for (const m of publicMethods) {
  check(methodDoc.includes(m), `docs/main.md method table is missing ${m}() (public on OpenShellBackend)`);
}
for (const m of methodDoc) {
  check(publicMethods.includes(m), `docs/main.md lists ${m}() but it is not a public method on OpenShellBackend`);
}

// ------------------------------------------------------------ preload

const preloadSrc = await read("src/preload/index.ts");
const apiStart = preloadSrc.indexOf("const api = {");
const apiBlock = preloadSrc.slice(apiStart, preloadSrc.indexOf("};", apiStart));
const apiMembers = [...apiBlock.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);

const preloadDoc = await read("docs/preload.md");
const preloadTable = [...preloadDoc.matchAll(/^\| `(\w+)\([^)]*\)` \|/gm)].map((m) => m[1]);
for (const m of apiMembers) {
  check(preloadTable.includes(m), `docs/preload.md contract is missing ${m}() (exposed on window.openshell)`);
}
for (const m of preloadTable) {
  check(apiMembers.includes(m), `docs/preload.md lists ${m}() but it is not exposed on window.openshell`);
}

// -------------------------------------------------------------- events.md

const storeSrc = await read("src/renderer/src/store.tsx");
const eventCases = [...storeSrc.matchAll(/\n\s{8}case "((?:session|permission|filesystem|project|plugin|command|skill|mcp|vcs|websearch|pty|question|form|tui|reference|integration|catalog|agent|model|installation|config|usage|shell)\.[\w.-]+)":/g)]
  .map((m) => m[1]);

const eventsDoc = await read("docs/events.md");
const handledStart = eventsDoc.indexOf("## Events the renderer handles");
const notHandledStart = eventsDoc.indexOf("## Events forwarded but NOT handled");
const handledEvents = [...eventsDoc
  .slice(handledStart, notHandledStart)
  .matchAll(/^\| `([\w.]+)` \|/gm)]
  .map((m) => m[1]);

const notHandledSection = eventsDoc.slice(notHandledStart, eventsDoc.indexOf("## Main-process event handling"));
const notHandledEvents = [...notHandledSection.matchAll(/`((?:session|permission|filesystem|project|plugin|command|skill|mcp|vcs|websearch|pty|question|form|tui|reference|integration|catalog|agent|model|installation|config|usage|shell)\.[\w.-]+)`/g)]
  .map((m) => m[1]);

for (const evt of eventCases) {
  check(
    handledEvents.includes(evt) || notHandledEvents.includes(evt),
    `docs/events.md: store handles ${evt} but it is in neither the handled table nor the not-handled list`
  );
}
for (const evt of handledEvents) {
  check(
    eventCases.includes(evt),
    `docs/events.md claims the store handles ${evt} but there is no such case in store.tsx`
  );
}
for (const evt of notHandledEvents) {
  check(
    !eventCases.includes(evt),
    `docs/events.md lists ${evt} as NOT handled, but store.tsx now has a case for it (move it to the handled table)`
  );
}

// ---------------------------------------------------------------- output

if (errors.length > 0) {
  console.error(`project brain drift detected (${errors.length} problem${errors.length === 1 ? "" : "s"}):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    "\nUpdate the affected docs (AGENTS.md / docs/*.md) so the brain stays accurate, then re-run `npm run docs:check`."
  );
  process.exit(1);
}
console.log("docs:check OK — project brain is in sync with the code");
