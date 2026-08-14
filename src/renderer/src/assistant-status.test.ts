import { describe, expect, it } from "vitest";
import { createParsedStatus, resolveAssistantStatus } from "./assistant-status";
import type { AssistantPartView } from "@shared/types";
import { IDLE_ACTIVITY } from "./session-activity";

function text(id: string, content: string, complete = false): AssistantPartView {
  return { kind: "text", id, text: content, complete };
}

function reasoning(id: string, complete = false): AssistantPartView {
  return { kind: "reasoning", id, text: "", complete };
}

function tool(id: string, title: string, status: "running" | "success" | "failed" = "running"): AssistantPartView {
  return { kind: "tool", id, tool: { id, title, detail: "", status } };
}

describe("assistant status", () => {
  it("reports composing while text streams", () => {
    expect(createParsedStatus([text("p1", "Hello", false)], "a1")).toEqual({
      activePartType: "text",
      activeToolName: undefined,
      statusText: "composing",
      isGenericStatus: false
    });
  });

  it("reports thinking while reasoning streams", () => {
    expect(createParsedStatus([reasoning("p1", false)], "a1")).toEqual({
      activePartType: "reasoning",
      activeToolName: undefined,
      statusText: "thinking",
      isGenericStatus: false
    });
  });

  it("reports the running tool phrase", () => {
    expect(createParsedStatus([tool("p1", "bash")], "a1")).toEqual({
      activePartType: "tool",
      activeToolName: "bash",
      statusText: "running command",
      isGenericStatus: false
    });
  });

  it("classifies editing tools separately", () => {
    expect(createParsedStatus([tool("p1", "edit")], "a1")).toEqual({
      activePartType: "editing",
      activeToolName: "edit",
      statusText: "editing file",
      isGenericStatus: false
    });
  });

  it("falls back to a stable generic phrase when nothing is active", () => {
    const first = createParsedStatus([text("p1", "done", true)], "a1");
    const second = createParsedStatus([text("p1", "done", true)], "a1");

    expect(first.isGenericStatus).toBe(true);
    expect(first.statusText).toBe(second.statusText);
  });

  it("prefers the last running part", () => {
    expect(createParsedStatus([tool("p1", "bash", "success"), text("p2", "x", false)], "a1").activePartType).toBe("text");
    expect(createParsedStatus([text("p2", "x", true), tool("p1", "bash")], "a1").activePartType).toBe("tool");
  });

  it("builds a streaming working summary from busy activity", () => {
    const summary = resolveAssistantStatus({
      assistantId: "a1",
      activity: { phase: "busy", isWorking: true, isBusy: true, isCooldown: false },
      parts: [text("p1", "Hello", false)],
      pendingPermissions: 0,
      retryInfo: null
    });

    expect(summary).toMatchObject({
      activity: "streaming",
      isWorking: true,
      isStreaming: true,
      lifecyclePhase: "streaming",
      statusText: "composing",
      canAbort: true,
      activePartType: "text"
    });
  });

  it("builds a tooling summary and a retry summary", () => {
    expect(resolveAssistantStatus({
      assistantId: "a1",
      activity: { phase: "busy", isWorking: true, isBusy: true, isCooldown: false },
      parts: [tool("p1", "bash")],
      pendingPermissions: 0,
      retryInfo: null
    })).toMatchObject({ activity: "tooling", statusText: "running command" });

    expect(resolveAssistantStatus({
      assistantId: "a1",
      activity: { phase: "retry", isWorking: true, isBusy: false, isCooldown: false },
      parts: [],
      pendingPermissions: 0,
      retryInfo: { attempt: 2, next: 5_000 }
    })).toMatchObject({ retryInfo: { attempt: 2, next: 5_000 } });
  });

  it("reports waiting for permission", () => {
    expect(resolveAssistantStatus({
      assistantId: "a1",
      activity: IDLE_ACTIVITY,
      parts: [],
      pendingPermissions: 1,
      retryInfo: null
    })).toMatchObject({ statusText: "waiting for permission", isWaitingForPermission: true, canAbort: false });
  });

  it("returns null without an assistant", () => {
    expect(resolveAssistantStatus({
      assistantId: null,
      activity: IDLE_ACTIVITY,
      parts: [],
      pendingPermissions: 0,
      retryInfo: null
    })).toBeNull();
  });
});
