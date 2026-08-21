import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_NAME = "OmniAgent.app";

function findBuiltApp(projectRoot, exists, readdir) {
  const release = path.join(projectRoot, "release");
  if (!exists(release)) return null;
  for (const entry of readdir(release)) {
    const candidate = path.join(release, entry, APP_NAME);
    if (exists(candidate)) return candidate;
  }
  return null;
}

export function installApp(options = {}) {
  const projectRoot = options.root ?? root;
  const applicationsDir = options.applicationsDir ?? "/Applications";
  const platform = options.platform ?? process.platform;
  const packOnly = options.packOnly ?? false;
  const run = options.execFileSync ?? execFileSync;
  const exists = options.existsSync ?? existsSync;
  const rm = options.rmSync ?? rmSync;
  const readdir = options.readdirSync ?? readdirSync;

  if (platform !== "darwin") {
    return { ok: false, message: "Install app is macOS-only" };
  }

  const builderCli = path.join(projectRoot, "node_modules", "electron-builder", "cli.js");
  if (!exists(builderCli)) {
    return { ok: false, message: "electron-builder is not installed — run npm install first" };
  }

  const runOptions = {
    cwd: projectRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    maxBuffer: 64 * 1024 * 1024
  };

  run(process.execPath, [path.join(projectRoot, "node_modules", "electron-vite", "bin", "electron-vite.js"), "build"], runOptions);
  run(process.execPath, [builderCli, "--mac", "dir", "--config", "electron-builder.yml", "--projectDir", projectRoot], runOptions);

  const built = findBuiltApp(projectRoot, exists, readdir);
  if (!built) {
    return { ok: false, message: "Packaging did not produce an OmniAgent.app bundle under release/" };
  }

  run("codesign", ["--force", "--deep", "--sign", "-", built]);

  if (packOnly) {
    return { ok: true, message: `Packaged ${path.relative(projectRoot, built)}` };
  }

  const destination = path.join(applicationsDir, APP_NAME);
  if (exists(destination)) rm(destination, { recursive: true, force: true });
  run("cp", ["-R", built, destination]);

  return { ok: true, message: `Installed OmniAgent to ${destination}` };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = installApp({ packOnly: process.argv.includes("--pack-only") });
    console.log(JSON.stringify(result));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.log(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : String(error) }));
    process.exit(1);
  }
}
