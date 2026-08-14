import type { W3cDiagnostic } from "@shared/types";

const HTML_VALIDATOR_URL = "https://validator.w3.org/nu/?out=json";
const CSS_VALIDATOR_URL = "https://jigsaw.w3.org/css-validator/validator";
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_CSS_BYTES = 200 * 1024;

type NuMessage = {
  type?: unknown;
  subType?: unknown;
  message?: unknown;
  firstLine?: unknown;
  firstColumn?: unknown;
  lastLine?: unknown;
  lastColumn?: unknown;
};

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function parseHtmlDiagnostics(body: string): W3cDiagnostic[] {
  const parsed = JSON.parse(body) as { messages?: unknown };
  if (!Array.isArray(parsed.messages)) return [];
  return parsed.messages.flatMap((value): W3cDiagnostic[] => {
    if (!value || typeof value !== "object") return [];
    const message = value as NuMessage;
    if (typeof message.message !== "string" || (message.type === "info" && message.subType !== "warning")) return [];
    return [{
      line: numberValue(message.firstLine, 1),
      column: numberValue(message.firstColumn, 1),
      endLine: numberValue(message.lastLine, numberValue(message.firstLine, 1)),
      endColumn: numberValue(message.lastColumn, numberValue(message.firstColumn, 1) + 1),
      message: message.message,
      severity: message.subType === "warning" ? "warning" : "error",
      source: "w3c-html"
    }];
  });
}

export function parseCssDiagnostics(body: string): W3cDiagnostic[] {
  return body.split(/\r?\n/).flatMap((line): W3cDiagnostic[] => {
    const match = /^.*?:(\d+)(?::(\d+))?:\s*(.*)$/.exec(line);
    if (!match || !match[3]) return [];
    const message = match[3].startsWith(":") ? match[3].slice(1) : match[3];
    return [{
      line: Number(match[1]),
      column: match[2] ? Number(match[2]) : 1,
      endLine: Number(match[1]),
      endColumn: (match[2] ? Number(match[2]) : 1) + 1,
      message,
      severity: /warning/i.test(message) ? "warning" : "error",
      source: "w3c-css"
    }];
  });
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(15_000), headers: { Accept: "application/json, text/plain", ...init?.headers } });
}

export async function validateWithW3c(path: string, content: string): Promise<W3cDiagnostic[]> {
  const lower = path.toLowerCase();
  if (Buffer.byteLength(content, "utf8") > (lower.endsWith(".html") || lower.endsWith(".htm") ? MAX_HTML_BYTES : MAX_CSS_BYTES)) return [];
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    const response = await request(HTML_VALIDATOR_URL, {
      method: "POST",
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: content
    });
    if (!response.ok) throw new Error(`W3C HTML validator returned ${response.status}`);
    return parseHtmlDiagnostics(await response.text());
  }
  const params = new URLSearchParams({ output: "gnu", profile: "css3", warning: "2", text: content });
  const response = await request(`${CSS_VALIDATOR_URL}?${params}`);
  if (!response.ok) throw new Error(`W3C CSS validator returned ${response.status}`);
  return parseCssDiagnostics(await response.text());
}
