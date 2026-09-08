import JSZip from "jszip";
import { normalizeHexColor, type CustomEditorThemeData } from "./editor-themes";

// Live Open VSX marketplace support for editor themes. This module never
// touches the Monaco API and never executes extension code: a .vsix is just
// a zip, and only the manifest plus the contributed theme JSON files are
// read out of it.

const OVSX_API = "https://open-vsx.org/api";
const SEARCH_SIZE = 12;

export interface OvsxThemeHit {
  namespace: string;
  name: string;
  displayName: string;
  description: string;
  downloadCount: number;
  version: string;
  downloadUrl: string;
}

export interface InstalledOvsxTheme {
  id: string;
  name: string;
  source: string;
  dark: boolean;
  data: CustomEditorThemeData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function searchOvsxThemes(query: string, signal?: AbortSignal): Promise<{ total: number; hits: OvsxThemeHit[] }> {
  const text = query.trim();
  const params = new URLSearchParams({
    query: text.length > 0 ? `category:themes ${text}` : "category:themes",
    size: String(SEARCH_SIZE)
  });
  let response: Response;
  try {
    response = await fetch(`${OVSX_API}/-/search?${params}`, { signal });
  } catch (err) {
    throw new Error(`Marketplace search failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!response.ok) throw new Error(`Marketplace search failed (HTTP ${response.status})`);
  const parsed: unknown = await response.json().catch(() => null);
  if (!isRecord(parsed) || !Array.isArray(parsed.extensions)) return { total: 0, hits: [] };
  const hits: OvsxThemeHit[] = [];
  for (const entry of parsed.extensions) {
    if (!isRecord(entry)) continue;
    const files = isRecord(entry.files) ? entry.files : {};
    const downloadUrl = files.download;
    if (typeof entry.namespace !== "string" || typeof entry.name !== "string" || typeof downloadUrl !== "string") continue;
    hits.push({
      namespace: entry.namespace,
      name: entry.name,
      displayName: typeof entry.displayName === "string" && entry.displayName.length > 0 ? entry.displayName : String(entry.name),
      description: typeof entry.description === "string" ? entry.description : "",
      downloadCount: typeof entry.downloadCount === "number" ? entry.downloadCount : 0,
      version: typeof entry.version === "string" ? entry.version : "",
      downloadUrl
    });
  }
  return { total: typeof parsed.totalSize === "number" ? parsed.totalSize : hits.length, hits };
}

// Longest-prefix map from TextMate scopes to Monaco tokens. The raw scope is
// always kept as well (Monaco tokens share the dotted syntax), so grammars
// with matching segments keep working and the mapped token covers the rest.
const PREFIX_TOKEN_MAP: Array<[string, string]> = [
  ["entity.name.function", "function"],
  ["support.function", "function"],
  ["entity.name.type", "type"],
  ["entity.name.class", "type"],
  ["support.type", "type"],
  ["support.class", "type"],
  ["comment", "comment"],
  ["string", "string"],
  ["keyword", "keyword"],
  ["storage", "keyword"],
  ["constant.numeric", "number"],
  ["constant", "keyword"],
  ["variable", "identifier"],
  ["entity", "type"],
  ["support", "type"]
];

function mappedToken(scope: string): string | null {
  const lower = scope.toLowerCase();
  for (const [prefix, token] of PREFIX_TOKEN_MAP) {
    if (lower === prefix || lower.startsWith(`${prefix}.`) || lower.startsWith(`${prefix} `)) return token;
  }
  return null;
}

const FONT_STYLE = /^(italic|bold|underline|strikethrough)(\s+(italic|bold|underline|strikethrough))*$/;

function pushRule(
  rules: CustomEditorThemeData["rules"],
  seen: Set<string>,
  token: string,
  foreground?: string,
  background?: string,
  fontStyle?: string
): void {
  const clean = token.trim().replace(/\s+/g, "");
  if (clean.length === 0 || seen.has(clean)) return;
  seen.add(clean);
  const rule: CustomEditorThemeData["rules"][number] = { token: clean };
  const fg = normalizeHexColor(foreground);
  if (fg) rule.foreground = fg.startsWith("#") ? fg.slice(1) : fg;
  const bg = normalizeHexColor(background);
  if (bg) rule.background = bg.startsWith("#") ? bg.slice(1) : bg;
  if (typeof fontStyle === "string" && FONT_STYLE.test(fontStyle.trim())) rule.fontStyle = fontStyle.trim();
  rules.push(rule);
}

function scopesOf(scope: unknown): string[] {
  const values = Array.isArray(scope) ? scope : [scope];
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    for (const part of value.split(",")) {
      const trimmed = part.trim();
      if (trimmed.length > 0) out.push(trimmed);
    }
  }
  return out;
}

function baseForUiTheme(uiTheme: unknown): string {
  if (uiTheme === "vs") return "vs";
  if (uiTheme === "hc-black" || uiTheme === "hc-light") return "vs-dark";
  return "vs-dark";
}

export function convertVscodeThemeFile(raw: unknown, uiTheme: unknown): CustomEditorThemeData | null {
  if (!isRecord(raw)) return null;
  if (Array.isArray(raw.rules)) {
    // Already Monaco-shaped: keep rules/colors, drop non-hex values.
    const rules: CustomEditorThemeData["rules"] = [];
    const seen = new Set<string>();
    for (const entry of raw.rules) {
      if (!isRecord(entry) || typeof entry.token !== "string") continue;
      pushRule(rules, seen, entry.token, entry.foreground as string | undefined, entry.background as string | undefined, entry.fontStyle as string | undefined);
    }
    const colors: Record<string, string> = {};
    if (isRecord(raw.colors)) {
      for (const [key, value] of Object.entries(raw.colors)) {
        const hex = normalizeHexColor(value);
        if (hex) colors[key] = hex;
      }
    }
    if (rules.length === 0 && Object.keys(colors).length === 0) return null;
    return { base: typeof raw.base === "string" ? raw.base : "vs-dark", inherit: true, rules, colors };
  }
  const tokenColors = raw.tokenColors;
  if (!Array.isArray(tokenColors)) return null;
  const rules: CustomEditorThemeData["rules"] = [];
  const seen = new Set<string>();
  for (const entry of tokenColors) {
    if (!isRecord(entry) || !isRecord(entry.settings)) continue;
    const settings = entry.settings as Record<string, unknown>;
    const foreground = settings.foreground as string | undefined;
    const background = settings.background as string | undefined;
    const fontStyle = settings.fontStyle as string | undefined;
    for (const scope of scopesOf(entry.scope)) {
      pushRule(rules, seen, scope, foreground, background, fontStyle);
      const mapped = mappedToken(scope);
      if (mapped) pushRule(rules, seen, mapped, foreground, background, fontStyle);
    }
  }
  const colors: Record<string, string> = {};
  if (isRecord(raw.colors)) {
    for (const [key, value] of Object.entries(raw.colors)) {
      const hex = normalizeHexColor(value);
      if (hex) colors[key] = hex;
    }
  }
  if (rules.length === 0 && Object.keys(colors).length === 0) return null;
  return { base: baseForUiTheme(uiTheme), inherit: true, rules, colors };
}

export function stripJsonComments(text: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  let escaped = false;
  while (i < text.length) {
    const char = text[i];
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      i += 1;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      i += 1;
      continue;
    }
    if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (char === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += char;
    i += 1;
  }
  return out;
}

function sanitizeIdPart(value: string): string {
  const clean = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return clean.length > 0 ? clean.slice(0, 40) : "theme";
}

interface VsixThemeContribution {
  label?: string;
  id?: string;
  uiTheme?: string;
  path: string;
}

export async function installOvsxTheme(downloadUrl: string, signal?: AbortSignal): Promise<InstalledOvsxTheme[]> {
  let response: Response;
  try {
    response = await fetch(downloadUrl, { signal });
  } catch (err) {
    throw new Error(`Theme download failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!response.ok) throw new Error(`Theme download failed (HTTP ${response.status})`);
  const buffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer).catch(() => {
    throw new Error("Downloaded file is not a valid theme package.");
  });
  const manifestFile = zip.file("extension/package.json");
  if (!manifestFile) throw new Error("Theme package has no extension manifest.");
  const manifest: unknown = JSON.parse(await manifestFile.async("text"));
  if (!isRecord(manifest)) throw new Error("Theme package manifest is unreadable.");
  const contributes = isRecord(manifest.contributes) ? manifest.contributes : {};
  const contributed = (contributes as Record<string, unknown>).themes;
  if (!Array.isArray(contributed) || contributed.length === 0) {
    throw new Error("This extension contributes no color themes.");
  }
  const namespace = typeof manifest.publisher === "string" ? manifest.publisher : "unknown";
  const extensionName = typeof manifest.name === "string" ? manifest.name : "theme";
  const extensionVersion = typeof manifest.version === "string" ? manifest.version : "";
  const source = `${namespace}/${extensionName}${extensionVersion ? ` v${extensionVersion}` : ""}`;
  const installed: InstalledOvsxTheme[] = [];
  const problems: string[] = [];
  for (const [index, entry] of contributed.entries()) {
    if (!isRecord(entry) || typeof entry.path !== "string") {
      problems.push("a theme entry without a file path");
      continue;
    }
    const contribution = entry as unknown as VsixThemeContribution;
    const lower = contribution.path.toLowerCase();
    if (!lower.endsWith(".json") && !lower.endsWith(".jsonc")) {
      problems.push(`${contribution.path} uses the legacy TextMate format, which Orbit does not convert`);
      continue;
    }
    const file = zip.file(`extension/${contribution.path.replace(/^\.\//, "")}`);
    if (!file) {
      problems.push(`${contribution.path} is listed but missing from the package`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripJsonComments(await file.async("text")));
    } catch {
      problems.push(`${contribution.path} is not valid JSON`);
      continue;
    }
    const data = convertVscodeThemeFile(parsed, contribution.uiTheme);
    if (!data) {
      problems.push(`${contribution.path} has no usable colors`);
      continue;
    }
    const fallback = contribution.path.split("/").pop()?.replace(/\.(jsonc?|tmtheme)$/i, "") ?? "theme";
    const name = typeof contribution.label === "string" && contribution.label.length > 0
      ? contribution.label
      : typeof contribution.id === "string" && contribution.id.length > 0
        ? contribution.id
        : fallback;
    installed.push({
      id: `ovsx-${sanitizeIdPart(namespace)}-${sanitizeIdPart(extensionName)}-${index}`,
      name,
      source,
      dark: data.base !== "vs",
      data
    });
  }
  if (installed.length === 0) {
    throw new Error(`No installable themes found (${problems.join("; ") || "unknown reason"}).`);
  }
  return installed;
}
