import { describe, expect, it } from "vitest";
import {
  APP_EDITOR_BACKGROUND,
  APP_THEME_MONACO,
  BUILTIN_EDITOR_THEME_OPTIONS,
  CURATED_EDITOR_THEME_OPTIONS,
  derivePinnedThemeData,
  editorThemeSwatches,
  ORBIT_MONACO_THEME_DATA,
  pinnedThemeId,
  readStoredCustomEditorThemes,
  resolveEffectiveThemeId
} from "./editor-themes";

const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

describe("editor theme catalog", () => {
  it("maps each app profile to its Monaco theme", () => {
    expect(APP_THEME_MONACO).toEqual({
      original: "orbit-original",
      paper: "orbit-paper",
      kitty: "orbit-kitty"
    });
  });

  it("ships unique built-in and curated ids with usable swatches", () => {
    const options = [...BUILTIN_EDITOR_THEME_OPTIONS, ...CURATED_EDITOR_THEME_OPTIONS];
    expect(BUILTIN_EDITOR_THEME_OPTIONS).toHaveLength(3);
    expect(CURATED_EDITOR_THEME_OPTIONS).toHaveLength(6);
    const ids = options.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const option of options) {
      expect(option.name.length).toBeGreaterThan(0);
      expect(option.blurb.length).toBeGreaterThan(0);
      expect(option.swatches.length).toBeGreaterThan(0);
      for (const swatch of option.swatches) expect(swatch).toMatch(HEX);
    }
    expect(CURATED_EDITOR_THEME_OPTIONS.every((option) => option.id.startsWith("curated-"))).toBe(true);
  });

  it("normalizes bare-hex token colors and drops non-hex values", () => {
    expect(editorThemeSwatches({
      colors: { "editor.background": "#262220", "editor.foreground": "e8e3dd" },
      rules: [{ foreground: "E8875F" }, { foreground: "rgba(0,0,0,1)" }, { foreground: "e8875f" }]
    })).toEqual(["#262220", "#e8e3dd", "#E8875F", "#e8875f"]);
  });

  it("caps swatches at five entries", () => {
    const rules = ["111111", "222222", "333333", "444444", "555555", "666666"].map((foreground) => ({ foreground }));
    expect(editorThemeSwatches({ colors: {}, rules })).toHaveLength(5);
  });

  it("pins a theme to the Orbit panel background without touching tokens", () => {
    for (const background of Object.values(APP_EDITOR_BACKGROUND)) {
      for (const color of Object.values(background)) expect(color).toMatch(HEX);
    }
    expect(pinnedThemeId("curated-dracula", "original")).toBe("curated-dracula-on-original");
    const pinned = derivePinnedThemeData(
      {
        base: "vs-dark",
        inherit: true,
        rules: [{ token: "comment", foreground: "6a9955" }],
        colors: { "editor.background": "#282a36", "editor.selectionBackground": "#44475a" }
      },
      "paper"
    );
    expect(pinned.colors["editor.background"]).toBe("#fbf7ec");
    expect(pinned.colors["editorGutter.background"]).toBe("#fbf7ec");
    expect(pinned.colors["minimap.background"]).toBe("#fbf7ec");
    expect(pinned.colors["editor.selectionBackground"]).toBe("#44475a");
    expect(pinned.rules).toEqual([{ token: "comment", foreground: "6a9955" }]);
    expect(pinned.base).toBe("vs-dark");
  });

  it("resolves every theme choice to a text-only editor theme", () => {    expect(resolveEffectiveThemeId("original", "auto")).toBe("orbit-original");
    expect(resolveEffectiveThemeId("paper", "auto")).toBe("orbit-paper");
    expect(resolveEffectiveThemeId("paper", "orbit-paper")).toBe("orbit-paper-on-paper");
    expect(resolveEffectiveThemeId("paper", "orbit-original")).toBe("orbit-original-on-paper");
    expect(resolveEffectiveThemeId("original", "curated-dracula")).toBe("curated-dracula-on-original");
    expect(resolveEffectiveThemeId("paper", "ovsx-acme-cool-0")).toBe("ovsx-acme-cool-0-on-paper");
  });

  it("covers every built-in option with pinnable theme data", () => {
    for (const option of BUILTIN_EDITOR_THEME_OPTIONS) {
      const data = ORBIT_MONACO_THEME_DATA[option.id];
      expect(data).toBeDefined();
      expect(typeof data.base).toBe("string");
      expect(Array.isArray(data.rules)).toBe(true);
      expect(typeof data.colors).toBe("object");
    }
  });

  it("keeps every derived id inside Monaco's theme-name rule", () => {
    // monaco.editor.defineTheme throws "Illegal theme name!" unless the id
    // matches /^[a-z0-9-]+$/i — a throw during render trips the error
    // boundary, so this is a crash guard, not cosmetics.
    const profiles = ["original", "paper", "kitty"];
    const ids = [...BUILTIN_EDITOR_THEME_OPTIONS, ...CURATED_EDITOR_THEME_OPTIONS].map((option) => option.id);
    for (const id of [...ids, "ovsx-acme-cool-0"]) {
      for (const profile of profiles) {
        expect(resolveEffectiveThemeId(profile, id)).toMatch(/^[a-z0-9-]+$/i);
      }
    }
  });

  it("rejects stored custom themes with illegal ids", () => {
    const valid = {
      id: "ovsx-acme-cool-0",
      name: "Cool",
      source: "Acme/cool",
      dark: true,
      data: { base: "vs-dark", inherit: true, rules: [], colors: {} }
    };
    window.localStorage.setItem(
      "orbit.editorCustomThemes",
      JSON.stringify([{ ...valid, id: "bad__id" }, valid])
    );
    expect(readStoredCustomEditorThemes()).toEqual([valid]);
    window.localStorage.clear();
  });
});
