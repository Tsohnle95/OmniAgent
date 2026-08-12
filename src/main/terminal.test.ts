// @vitest-environment node
import { describe, expect, it } from "vitest";
import { TerminalManager } from "./terminal";

const workspace = { id: "11111111-1111-4111-8111-111111111111" };

describe("TerminalManager capability ownership", () => {
  it("rejects unknown terminal operations", () => {
    const terminals = new TerminalManager();
    expect(() => terminals.write("term-1", "x", workspace)).toThrow("unknown terminal");
    expect(() => terminals.resize("term-1", 80, 24, workspace)).toThrow("unknown or unavailable terminal");
    expect(() => terminals.stop("term-1", workspace)).toThrow("unknown terminal");
  });

  it("rejects a terminal owned by a stale workspace", () => {
    const terminals = new TerminalManager();
    const pty = { write: () => {}, resize: () => {}, kill: () => {} };
    const state = terminals as unknown as {
      terminals: Map<string, { pty: typeof pty; workspaceId: string }>;
    };
    state.terminals.set("term-1", { pty, workspaceId: workspace.id });
    const current = { id: "22222222-2222-4222-8222-222222222222" };
    expect(() => terminals.write("term-1", "x", current)).toThrow("stale terminal");
    expect(() => terminals.stop("term-1", current)).toThrow("stale terminal");
  });
});
