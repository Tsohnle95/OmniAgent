import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveAppSource } from "./source-resolver";

const roots: string[] = [];

async function tempRoot(name: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), `${name}-`));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("resolveAppSource", () => {
  it("resolves an absolute source only inside the application root", async () => {
    const appRoot = await tempRoot("orbit-source");
    const source = path.join(appRoot, "src/renderer/styles/main.scss");
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(source, ".root {}", "utf8");

    await expect(resolveAppSource(appRoot, source, `${source}:14`)).resolves.toBe(await realpath(source));
  });

  it("rejects an absolute source from an unrelated workspace", async () => {
    const appRoot = await tempRoot("orbit-source");
    const workspace = await tempRoot("unrelated-workspace");
    const source = path.join(workspace, "private.scss");
    await writeFile(source, ".private {}", "utf8");

    await expect(resolveAppSource(appRoot, source, `${source}:7`)).resolves.toBeNull();
  });

  it("maps a development server URL into the application source tree", async () => {
    const appRoot = await tempRoot("orbit-source");
    const source = path.join(appRoot, "src/renderer/styles/main.scss");
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(source, ".root {}", "utf8");

    await expect(resolveAppSource(appRoot, "http://localhost:5173/src/renderer/styles/main.scss?t=1", "main.scss:9"))
      .resolves.toBe(await realpath(source));
  });

  it("rejects a source symlink that leaves the application root", async () => {
    const appRoot = await tempRoot("orbit-source");
    const outside = await tempRoot("outside-source");
    const target = path.join(outside, "outside.scss");
    const source = path.join(appRoot, "linked.scss");
    await writeFile(target, ".outside {}", "utf8");
    await symlink(target, source);

    await expect(resolveAppSource(appRoot, source, `${source}:3`)).resolves.toBeNull();
  });
});
