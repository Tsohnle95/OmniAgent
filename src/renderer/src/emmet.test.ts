import { describe, expect, it } from "vitest";
import { emmetSnippetAt } from "./emmet";

describe("emmetSnippetAt", () => {
  it("expands ! into the HTML5 skeleton at the start of an html file", () => {
    const found = emmetSnippetAt("!", "html");
    expect(found).not.toBeNull();
    expect(found!.abbr).toBe("!");
    expect(found!.startColumn).toBe(1);
    expect(found!.snippet).toContain("<!DOCTYPE html>");
    expect(found!.snippet).toContain('<title>${1:Document}</title>');
    expect(found!.snippet).toContain("<body>\n\t${0}\n</body>");
  });

  it("expands an abbreviation at the end of a line", () => {
    const found = emmetSnippetAt("    ul>li*3", "html");
    expect(found!.abbr).toBe("ul>li*3");
    expect(found!.startColumn).toBe(5);
    expect(found!.snippet).toBe("<ul>\n\t<li></li>\n\t<li></li>\n\t<li></li>\n</ul>${0}");
  });

  it("restores the title tab stop when expanding a title with text", () => {
    const found = emmetSnippetAt("title{Hello}", "html");
    expect(found!.snippet).toContain("<title>${1:Hello}</title>");
  });

  it("expands known tags", () => {
    expect(emmetSnippetAt("div", "html")!.snippet).toBe("<div></div>${0}");
    expect(emmetSnippetAt("a", "html")!.snippet).toBe('<a href=""></a>${0}');
    expect(emmetSnippetAt("p.red", "html")!.snippet).toBe('<p class="red"></p>${0}');
  });

  it("ignores noise like unknown words and unknown tagged dots", () => {
    expect(emmetSnippetAt("mydiv", "html")).toBeNull();
    expect(emmetSnippetAt("hello", "html")).toBeNull();
    expect(emmetSnippetAt("abc.", "html")).toBeNull();
    expect(emmetSnippetAt("xdiv", "html")).toBeNull();
  });

  it("expands css abbreviations but not css noise", () => {
    expect(emmetSnippetAt("m10", "css")!.snippet).toBe("margin: 10px;${0}");
    expect(emmetSnippetAt("p10", "scss")!.snippet).toBe("padding: 10px;${0}");
    expect(emmetSnippetAt("hello", "css")).toBeNull();
    expect(emmetSnippetAt("abc:d", "less")).toBeNull();
  });

  it("never expands outside of the supported languages", () => {
    expect(emmetSnippetAt("div", "plaintext")).toBeNull();
    expect(emmetSnippetAt("!", "javascript")).toBeNull();
    expect(emmetSnippetAt("!", "typescript")).toBeNull();
  });

  it("does not expand a bang followed by other characters", () => {
    expect(emmetSnippetAt("!x", "html")).toBeNull();
    expect(emmetSnippetAt("!", "html")).not.toBeNull();
  });

  it("escapes stray dollars in expanded text", () => {
    const found = emmetSnippetAt("div{a\\$b}", "html");
    expect(found!.snippet).toContain("<div>a\\$b</div>");
  });

  it("stops the backscan at quotes", () => {
    expect(emmetSnippetAt('title="foo', "html")).toBeNull();
  });

  it("expands an abbreviation preceded by whitespace", () => {
    expect(emmetSnippetAt("x div", "html")!.abbr).toBe("div");
  });
});