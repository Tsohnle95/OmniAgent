import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITOR_FONT_SIZE,
  EDITOR_FONT_OPTIONS,
  MAX_EDITOR_FONT_SIZE,
  MIN_EDITOR_FONT_SIZE,
  editorFontFamily,
  normalizeEditorFont,
  normalizeEditorFontSize
} from "./editor-fonts";

describe("code font catalog", () => {
  it("ships unique font ids with usable families", () => {
    const ids = EDITOR_FONT_OPTIONS.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("system");
    for (const option of EDITOR_FONT_OPTIONS) {
      expect(option.name.length).toBeGreaterThan(0);
      expect(option.family).toContain("monospace");
      expect(option.familyName.length).toBeGreaterThan(0);
      expect(option.family).toContain(option.familyName);
    }
  });

  it("accepts known fonts and falls back to system", () => {
    expect(normalizeEditorFont("fira-code")).toBe("fira-code");
    expect(normalizeEditorFont("unknown")).toBe("system");
    expect(normalizeEditorFont(null)).toBe("system");
  });

  it("clamps sizes and restores the default for garbage", () => {
    expect(normalizeEditorFontSize(16)).toBe(16);
    expect(normalizeEditorFontSize(1)).toBe(MIN_EDITOR_FONT_SIZE);
    expect(normalizeEditorFontSize(99)).toBe(MAX_EDITOR_FONT_SIZE);
    expect(normalizeEditorFontSize("junk")).toBe(DEFAULT_EDITOR_FONT_SIZE);
    expect(normalizeEditorFontSize(null)).toBe(DEFAULT_EDITOR_FONT_SIZE);
  });

  it("resolves families with a monospace fallback", () => {
    expect(editorFontFamily("jetbrains-mono")).toContain("JetBrains Mono");
    expect(editorFontFamily("system")).toContain("monospace");
  });
});
