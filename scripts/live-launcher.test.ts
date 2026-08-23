// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyLiveLauncher, liveLauncherPayload } from "./install-app.mjs";
import { MARKER_FILE, decideLaunch } from "./live-launcher.cjs";

const repoRoot = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname)), "..");

function makeFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "omniagent-live-"));
  mkdirSync(path.join(root, "src", "main"), { recursive: true });
  writeFileSync(path.join(root, "src", "main", "index.ts"), "export {};\n");
  return root;
}

function writeBuild(root, mtimeMs) {
  mkdirSync(path.join(root, "out", "main"), { recursive: true });
  const entry = path.join(root, "out", "main", "index.js");
  writeFileSync(entry, "// build\n");
  utimesSync(entry, new Date(mtimeMs), new Date(mtimeMs));
}

describe("live launcher build decision", () => {
  it("builds when no compiled build exists", () => {
    const root = makeFixture();
    try {
      expect(decideLaunch({ projectRoot: root })).toMatchObject({ action: "build" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("launches directly when the build is current", () => {
    const root = makeFixture();
    try {
      utimesSync(path.join(root, "src", "main", "index.ts"), new Date(1000), new Date(1000));
      writeBuild(root, 2000);
      expect(decideLaunch({ projectRoot: root })).toEqual({ action: "launch" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("builds when repository sources are newer than the build", () => {
    const root = makeFixture();
    try {
      utimesSync(path.join(root, "src", "main", "index.ts"), new Date(3000), new Date(3000));
      writeBuild(root, 2000);
      expect(decideLaunch({ projectRoot: root })).toMatchObject({ action: "build" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores dependency and build output directories when scanning sources", () => {
    const root = makeFixture();
    try {
      utimesSync(path.join(root, "src", "main", "index.ts"), new Date(1000), new Date(1000));
      writeBuild(root, 2000);
      mkdirSync(path.join(root, "node_modules", "some-dep"), { recursive: true });
      writeFileSync(path.join(root, "node_modules", "some-dep", "newer.ts"), "export {};\n");
      expect(decideLaunch({ projectRoot: root })).toEqual({ action: "launch" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("live launcher payload", () => {
  it("replaces the packaged payload with the repository-backed launcher", () => {
    const fixture = makeFixture();
    const bundle = mkdtempSync(path.join(os.tmpdir(), "omniagent-bundle-"));
    try {
      const appDir = path.join(bundle, "Contents", "Resources", "app");
      mkdirSync(path.join(appDir, "out", "main"), { recursive: true });
      writeFileSync(path.join(appDir, "out", "main", "index.js"), "// frozen build\n");
      mkdirSync(path.join(appDir, "node_modules", "leftover"), { recursive: true });

      applyLiveLauncher(bundle, repoRoot);

      expect(existsSync(path.join(appDir, "out"))).toBe(false);
      expect(existsSync(path.join(appDir, "node_modules"))).toBe(false);
      const packageJson = JSON.parse(readFileSync(path.join(appDir, "package.json"), "utf8"));
      expect(packageJson.main).toBe("live-launcher.cjs");
      expect(existsSync(path.join(appDir, "live-launcher.cjs"))).toBe(true);
      expect(existsSync(MARKER_FILE)).toBe(false);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
      rmSync(bundle, { recursive: true, force: true });
    }
  });

  it("describes a package whose entry point is the launcher", () => {
    const payload = liveLauncherPayload(repoRoot);
    const parsed = JSON.parse(payload.packageJson);
    expect(parsed.main).toBe("live-launcher.cjs");
    expect(payload.launcherSource.endsWith(path.join("scripts", "live-launcher.cjs"))).toBe(true);
    expect(existsSync(payload.launcherSource)).toBe(true);
  });
});
