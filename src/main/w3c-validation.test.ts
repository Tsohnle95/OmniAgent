import { describe, expect, it } from "vitest";
import { parseCssDiagnostics, parseHtmlDiagnostics, validateWithW3c } from "./w3c-validation";

describe("W3C diagnostic parsing", () => {
  it("maps Nu checker messages to editor positions", () => {
    expect(parseHtmlDiagnostics(JSON.stringify({ messages: [
      { type: "error", firstLine: 3, firstColumn: 4, lastLine: 3, lastColumn: 8, message: "Invalid element" },
      { type: "info", firstLine: 1, firstColumn: 1, message: "Informational" },
      { type: "info", subType: "warning", firstLine: 2, firstColumn: 1, message: "Consider lang" }
    ] }))).toEqual([
      { line: 3, column: 4, endLine: 3, endColumn: 8, message: "Invalid element", severity: "error", source: "w3c-html" },
      { line: 2, column: 1, endLine: 2, endColumn: 2, message: "Consider lang", severity: "warning", source: "w3c-html" }
    ]);
  });

  it("maps CSS validator gnu output to editor positions", () => {
    expect(parseCssDiagnostics("file://localhost/TextArea:4:.foo:Parse Error\nfile://localhost/TextArea:8:  :A warning"))
      .toEqual([
        { line: 4, column: 1, endLine: 4, endColumn: 2, message: ".foo:Parse Error", severity: "error", source: "w3c-css" },
        { line: 8, column: 1, endLine: 8, endColumn: 2, message: "A warning", severity: "warning", source: "w3c-css" }
      ]);
  });

  it("skips preprocessor sources without contacting the validators", async () => {
    await expect(validateWithW3c("src/styles/_welcome.scss", ".a { .b { color: red; } }")).resolves.toEqual([]);
    await expect(validateWithW3c("src/styles/main.less", "@x: 1;")).resolves.toEqual([]);
  });
});
