// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { defaultShell, TerminalManager } from "./terminal";
import type { IPty } from "node-pty";

const workspace = { id: "11111111-1111-4111-8111-111111111111", generation: 1 };

describe("TerminalManager capability ownership", () => {
  it("rejects unknown terminal operations", () => {
    const terminals = new TerminalManager();
    expect(() => terminals.write("term-1", "x", workspace)).toThrow("unknown terminal");
    expect(() => terminals.resize("term-1", 80, 24, workspace)).toThrow("unknown or unavailable terminal");
    expect(() => terminals.stop("term-1", workspace)).toThrow("unknown terminal");
  });

  it("publishes startup output and an early exit under the renderer-provided id before start resolves", async () => {
    let onData!: (data: string) => void;
    let onExit!: (event: { exitCode: number; signal?: number }) => void;
    const pty = {
      onData: (listener: typeof onData) => { onData = listener; return { dispose() {} }; },
      onExit: (listener: typeof onExit) => { onExit = listener; return { dispose() {} }; },
      write() {}, resize() {}, kill() {}
    } as unknown as IPty;
    const manager = new TerminalManager(vi.fn(() => {
      queueMicrotask(() => {
        onData("ready");
        onExit({ exitCode: 0 });
      });
      return pty;
    }) as never);
    const messages: unknown[] = [];
    manager.onMessage((message) => messages.push(message));
    const id = "term-11111111-1111-4111-8111-111111111111";

    await manager.start(id, "/tmp", workspace);
    await Promise.resolve();

    expect(messages).toEqual([
      { kind: "terminal-data", terminal: { id, data: "ready" } },
      { kind: "terminal-exit", terminal: { id, exitCode: 0 } }
    ]);
    expect(() => manager.write(id, "x", workspace)).toThrow("unknown terminal");
  });

  it("rejects a terminal owned by a stale workspace", () => {
    const terminals = new TerminalManager();
    const pty = { write: () => {}, resize: () => {}, kill: () => {} };
    const state = terminals as unknown as {
      terminals: Map<string, { pty: typeof pty; workspaceId: string }>;
    };
    state.terminals.set("term-1", { pty, workspaceId: workspace.id });
    const current = { id: "22222222-2222-4222-8222-222222222222", generation: 2 };
    expect(() => terminals.write("term-1", "x", current)).toThrow("stale terminal");
    expect(() => terminals.stop("term-1", current)).toThrow("stale terminal");
  });

});

describe("terminal platform configuration", () => {
  it("selects each platform's normal interactive shell", () => {
    expect(defaultShell("darwin", {})).toBe("/bin/zsh");
    expect(defaultShell("linux", {})).toBe("/bin/bash");
    expect(defaultShell("win32", {})).toBe("powershell.exe");
    expect(defaultShell("darwin", { SHELL: "/opt/homebrew/bin/fish" })).toBe("/opt/homebrew/bin/fish");
    expect(defaultShell("win32", { COMSPEC: "C:\\Windows\\System32\\cmd.exe" })).toBe("C:\\Windows\\System32\\cmd.exe");
  });
});
