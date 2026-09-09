import { describe, expect, it } from "vitest";
import {
  APP_EDITOR_BACKGROUND,
  APP_THEME_MONACO,
  BUILTIN_EDITOR_THEME_OPTIONS,
  CURATED_EDITOR_THEME_OPTIONS,
  derivePinnedThemeData,
  editorThemeSwatches,
  pinnedThemeId,
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
    expect(pinnedThemeId("curated-dracula", "original")).toBe("curated-dracula__bg-original");
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

  it("resolves every theme choice to a text-only editor theme", () => {
    expect(resolveEffectiveThemeId("original", "auto")).toBe("orbit-original");
    expect(resolveEffectiveThemeId("paper", "auto")).toBe("orbit-paper");
    expect(resolveEffectiveThemeId("original", "orbit-paper")).toBe("orbit-paper");
    expect(resolveEffectiveThemeId("original", "curated-dracula")).toBe("curated-dracula__bg-original");
    expect(resolveEffectiveThemeId("paper", "ovsx-acme-cool-0")).toBe("ovsx-acme-cool-0__bg-paper");
  });
});
