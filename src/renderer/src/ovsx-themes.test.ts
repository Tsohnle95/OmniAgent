import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  convertVscodeThemeFile,
  installOvsxTheme,
  searchOvsxThemes,
  stripJsonComments
} from "./ovsx-themes";

const VSCODE_THEME = {
  name: "Fixture",
  colors: {
    "editor.background": "#1e1e1e",
    "editor.foreground": "#d4d4d4",
    "invalid": "rgba(0,0,0,1)"
  },
  tokenColors: [
    { scope: "comment", settings: { foreground: "#6a9955", fontStyle: "italic" } },
    { scope: ["keyword", "storage.type"], settings: { foreground: "#569cd6" } },
    { scope: "entity.name.function, support.function", settings: { foreground: "#dcdcaa" } },
    { scope: "constant.numeric", settings: { foreground: "#b5cea8" } },
    { scope: 42, settings: {} }
  ]
};

function ruleFor(data: NonNullable<ReturnType<typeof convertVscodeThemeFile>>, token: string): Record<string, string | undefined> {
  const found = data.rules.find((rule) => rule.token === token);
  expect(found).toBeDefined();
  return found as Record<string, string | undefined>;
}

describe("VS Code theme conversion", () => {
  it("converts token colors with mapped and raw tokens", () => {
    const data = convertVscodeThemeFile(VSCODE_THEME, "vs-dark");
    expect(data).not.toBeNull();
    expect(data?.base).toBe("vs-dark");
    expect(data?.inherit).toBe(true);
    expect(ruleFor(data!, "comment")).toMatchObject({ foreground: "6a9955", fontStyle: "italic" });
    expect(ruleFor(data!, "keyword")).toMatchObject({ foreground: "569cd6" });
    expect(ruleFor(data!, "storage.type")).toMatchObject({ foreground: "569cd6" });
    expect(ruleFor(data!, "function")).toMatchObject({ foreground: "dcdcaa" });
    expect(ruleFor(data!, "entity.name.function")).toMatchObject({ foreground: "dcdcaa" });
    expect(ruleFor(data!, "number")).toMatchObject({ foreground: "b5cea8" });
    expect(data?.colors).toEqual({ "editor.background": "#1e1e1e", "editor.foreground": "#d4d4d4" });
  });

  it("maps the base from the contributed uiTheme", () => {
    expect(convertVscodeThemeFile(VSCODE_THEME, "vs")?.base).toBe("vs");
    expect(convertVscodeThemeFile(VSCODE_THEME, undefined)?.base).toBe("vs-dark");
    expect(convertVscodeThemeFile(VSCODE_THEME, "hc-black")?.base).toBe("vs-dark");
  });

  it("passes Monaco-shaped themes through with hex normalization", () => {
    const data = convertVscodeThemeFile({
      base: "vs",
      rules: [
        { token: "comment", foreground: "#111111" },
        { token: "", foreground: "222222" },
        { token: "bare", foreground: "ab12cd" }
      ],
      colors: { "editor.background": "#ffffff", bad: "red" }
    }, "vs-dark");
    expect(data?.base).toBe("vs");
    expect(ruleFor(data!, "comment")).toMatchObject({ foreground: "111111" });
    expect(ruleFor(data!, "bare")).toMatchObject({ foreground: "ab12cd" });
    expect(data?.rules.some((rule) => rule.token === "")).toBe(false);
    expect(data?.colors).toEqual({ "editor.background": "#ffffff" });
  });

  it("rejects themes without usable colors", () => {
    expect(convertVscodeThemeFile(null, "vs-dark")).toBeNull();
    expect(convertVscodeThemeFile({}, "vs-dark")).toBeNull();
    expect(convertVscodeThemeFile({ tokenColors: [] }, "vs-dark")).toBeNull();
  });

  it("strips JSON comments without touching strings", () => {
    const parsed = JSON.parse(stripJsonComments('{\n// leading\n"a": 1, /* inline */ "b": "http://x" // trailing\n}'));
    expect(parsed).toEqual({ a: 1, b: "http://x" });
  });
});

describe("Open VSX search", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(handler: () => Promise<Response>): void {
    vi.stubGlobal("fetch", vi.fn(handler));
  }

  it("maps search results to hits", async () => {
    stubFetch(async () => new Response(JSON.stringify({
      totalSize: 51,
      extensions: [{
        namespace: "Acme",
        name: "cool",
        displayName: "Cool",
        description: "A cool theme.",
        downloadCount: 7,
        version: "1.0.0",
        files: { download: "https://example/cool.vsix" }
      }, { namespace: "Broken" }]
    }), { status: 200 }));
    const found = await searchOvsxThemes("cool");
    expect(found.total).toBe(51);
    expect(found.hits).toEqual([{
      namespace: "Acme",
      name: "cool",
      displayName: "Cool",
      description: "A cool theme.",
      downloadCount: 7,
      version: "1.0.0",
      downloadUrl: "https://example/cool.vsix"
    }]);
  });

  it("reports HTTP and network failures", async () => {
    stubFetch(async () => new Response("nope", { status: 500 }));
    await expect(searchOvsxThemes("x")).rejects.toThrow("HTTP 500");
    stubFetch(async () => { throw new Error("offline"); });
    await expect(searchOvsxThemes("x")).rejects.toThrow("Marketplace search failed");
  });

  it("tolerates malformed payloads", async () => {
    stubFetch(async () => new Response(JSON.stringify({}), { status: 200 }));
    await expect(searchOvsxThemes("x")).resolves.toEqual({ total: 0, hits: [] });
  });
});

describe("Open VSX install", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function vsix(files: Record<string, string>): Promise<Uint8Array> {
    const zip = new JSZip();
    for (const [path, content] of Object.entries(files)) zip.file(path, content);
    return zip.generateAsync({ type: "uint8array" });
  }

  function stubDownload(payload: Uint8Array): void {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => payload
    }) as unknown as Response));
  }

  it("extracts contributed JSON themes and skips legacy formats", async () => {
    stubDownload(await vsix({
      "extension/package.json": JSON.stringify({
        publisher: "Acme",
        name: "cool",
        version: "1.0.0",
        contributes: {
          themes: [
            { label: "Cool Dark", uiTheme: "vs-dark", path: "./themes/cool.json" },
            { label: "Legacy", path: "./themes/old.tmTheme" }
          ]
        }
      }),
      "extension/themes/cool.json": JSON.stringify({
        colors: { "editor.background": "#000000" },
        tokenColors: [{ scope: "comment", settings: { foreground: "#ffffff" } }]
      })
    }));
    const installed = await installOvsxTheme("https://example/cool.vsix");
    expect(installed).toHaveLength(1);
    expect(installed[0]).toMatchObject({
      id: "ovsx-acme-cool-0",
      name: "Cool Dark",
      source: "Acme/cool v1.0.0",
      dark: true
    });
    expect(installed[0].data.rules).toContainEqual({ token: "comment", foreground: "ffffff" });
  });

  it("rejects packages without installable themes", async () => {
    stubDownload(await vsix({
      "extension/package.json": JSON.stringify({ publisher: "Acme", name: "empty", contributes: {} })
    }));
    await expect(installOvsxTheme("https://example/empty.vsix")).rejects.toThrow("no color themes");

    stubDownload(await vsix({
      "extension/package.json": JSON.stringify({
        publisher: "Acme",
        name: "missing",
        contributes: { themes: [{ label: "Gone", path: "./themes/gone.json" }] }
      })
    }));
    await expect(installOvsxTheme("https://example/missing.vsix")).rejects.toThrow("missing from the package");
  });
});
