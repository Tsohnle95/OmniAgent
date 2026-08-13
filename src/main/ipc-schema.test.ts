// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  IPC_LIMITS,
  activationGeneration,
  commandPayload,
  directoryPath,
  fileWriteIdentity,
  movePayload,
  permissionPayload,
  promptPayload,
  queryText,
  selectionId,
  sessionId
} from "./ipc-schema";

const workspace = { id: "11111111-1111-4111-8111-111111111111", generation: 1 };

describe("runtime IPC schemas", () => {
  it.each([
    ["activation", () => activationGeneration(1), () => activationGeneration(0)],
    ["directory", () => directoryPath("/workspace"), () => directoryPath("x".repeat(IPC_LIMITS.directory + 1))],
    ["session", () => sessionId("session-1"), () => sessionId("")],
    ["query", () => queryText("src"), () => queryText("x".repeat(IPC_LIMITS.query + 1))],
    ["selection", () => selectionId("model/large", "model id"), () => selectionId("", "model id")],
    ["command", () => commandPayload("review", "--all"), () => commandPayload("x".repeat(IPC_LIMITS.command + 1), "")],
    ["permission", () => permissionPayload("request", "once", "session"), () => permissionPayload("request", "yes", "session")]
  ])("accepts valid and rejects invalid %s payloads", (_name, valid, invalid) => {
    expect(valid()).toBeDefined();
    expect(invalid).toThrow();
  });

  it("validates prompt files, spans, counts, and text bounds", () => {
    expect(promptPayload(workspace, "@src/file.ts inspect", [{
      path: "/tmp/file.ts",
      mention: { start: 0, end: 12, text: "@src/file.ts" }
    }]).files).toHaveLength(1);
    expect(() => promptPayload(workspace, "short", [{
      path: "/tmp/file.ts",
      mention: { start: 0, end: 9, text: "too long" }
    }])).toThrow("invalid prompt mention");
    expect(() => promptPayload(workspace, "x".repeat(IPC_LIMITS.prompt + 1), [])).toThrow("invalid prompt text");
    expect(() => promptPayload(workspace, "ok", Array.from({ length: IPC_LIMITS.promptFiles + 1 }, () => ({ path: "/tmp/a" })))).toThrow("invalid prompt files");
  });

  it("validates write identity shape and expected content", () => {
    const write = {
      id: "write-1",
      workspaceID: workspace.id,
      revision: 2,
      expectedContent: "disk",
      overwrite: false
    };
    expect(fileWriteIdentity(write, workspace)).toEqual(write);
    expect(() => fileWriteIdentity({ ...write, workspaceID: "other" }, workspace)).toThrow("invalid file write identity");
  });

  it("validates move payloads with nested and root destinations", () => {
    expect(movePayload(workspace, "docs/note.txt", "archive")).toEqual({
      workspace,
      rel: "docs/note.txt",
      newParent: "archive"
    });
    expect(movePayload(workspace, "note.txt", "")).toEqual({
      workspace,
      rel: "note.txt",
      newParent: ""
    });
    expect(() => movePayload(workspace, "docs/../note.txt", "")).toThrow("invalid workspace path");
    expect(() => movePayload(workspace, "note.txt", "/absolute")).toThrow("invalid workspace path");
    expect(() => movePayload(workspace, "note.txt", "a//b")).toThrow("invalid workspace path");
  });
});
