import type { AssistantPartView, ToolCallView, ToolContentView, TranscriptItem } from "@shared/types";

export interface ChatStreamEvent {
  id: string;
  type: string;
  created: number;
  data: Record<string, any>;
}

function messageID(data: Record<string, any>): string {
  return String(data.assistantMessageID ?? data.messageID ?? "");
}

function toolID(data: Record<string, any>): string {
  return String(data.callID ?? data.id ?? "");
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    if (typeof value.message === "string") return value.message;
    if (value.data && typeof value.data === "object") {
      const data = value.data as Record<string, unknown>;
      if (typeof data.message === "string") return data.message;
    }
  }
  return error == null ? "" : String(error);
}

function stringify(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function metadata(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function toolOutput(data: Record<string, any>): string {
  const content = data.content ?? data.output;
  if (Array.isArray(content)) {
    return content
      .filter((item) => item?.type === "text")
      .map((item) => String(item.text ?? ""))
      .join("\n");
  }
  return stringify(content);
}

function toolContent(data: Record<string, any>): ToolContentView[] | undefined {
  const content = data.content;
  if (!Array.isArray(content)) return undefined;
  const items = content.flatMap((raw): ToolContentView[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    if (item.type === "text") return [{ type: "text", text: String(item.text ?? "") }];
    if (item.type !== "file" || typeof item.uri !== "string" || typeof item.mime !== "string") return [];
    return [{
      type: "file",
      uri: item.uri,
      mime: item.mime,
      ...(typeof item.name === "string" ? { name: item.name } : {})
    }];
  });
  return items.length > 0 ? items : undefined;
}

function paths(input: unknown): string[] {
  const result: string[] = [];
  const walk = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (
        (key === "filePath" || key === "file_path" || key === "path") &&
        typeof child === "string" &&
        !child.startsWith("http")
      ) {
        result.push(child);
      } else {
        walk(child);
      }
    }
  };
  walk(input);
  return [...new Set(result)];
}

function toolDetail(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const value = input as Record<string, unknown>;
  if (typeof value.filePath === "string") return value.filePath;
  if (typeof value.file_path === "string") return value.file_path;
  if (typeof value.command === "string") return `$ ${value.command}`;
  return "";
}

function inferTool(input: unknown): string {
  if (!input || typeof input !== "object") return "tool";
  const value = input as Record<string, unknown>;
  if (typeof value.tool === "string") return value.tool;
  if (typeof value.name === "string") return value.name;
  if ("command" in value) return "bash";
  if ("filePath" in value || "file_path" in value) return "file";
  if ("query" in value) return "search";
  if ("url" in value) return "web";
  if ("prompt" in value) return "prompt";
  return "tool";
}

function createAssistant(id: string, created: number): Extract<TranscriptItem, { kind: "assistant" }> {
  return {
    kind: "assistant",
    id,
    messageID: id,
    parts: [],
    completed: false
  };
}

function updateAssistant(
  items: TranscriptItem[],
  id: string,
  created: number,
  update: (assistant: Extract<TranscriptItem, { kind: "assistant" }>) => Extract<TranscriptItem, { kind: "assistant" }>
): TranscriptItem[] {
  if (!id) return items;
  const index = items.findIndex((item) => item.kind === "assistant" && item.messageID === id);
  if (index === -1) return [...items, update(createAssistant(id, created))];
  return items.map((item, itemIndex) =>
    itemIndex === index && item.kind === "assistant" ? update(item) : item
  );
}

function updateLatestAssistant(
  items: TranscriptItem[],
  update: (assistant: Extract<TranscriptItem, { kind: "assistant" }>) => Extract<TranscriptItem, { kind: "assistant" }>
): TranscriptItem[] {
  let index = -1;
  for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
    if (items[itemIndex].kind === "assistant") {
      index = itemIndex;
      break;
    }
  }
  if (index === -1) return items;
  return items.map((item, itemIndex) =>
    itemIndex === index && item.kind === "assistant" ? update(item) : item
  );
}

function upsertItem(items: TranscriptItem[], item: TranscriptItem): TranscriptItem[] {
  const index = items.findIndex((current) => current.id === item.id);
  if (index === -1) return [...items, item];
  return items.map((current, itemIndex) => itemIndex === index ? item : current);
}

function updateLatestCompaction(
  items: TranscriptItem[],
  update: (item: Extract<TranscriptItem, { kind: "compaction" }>) => Extract<TranscriptItem, { kind: "compaction" }>
): TranscriptItem[] {
  let index = -1;
  for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
    if (items[itemIndex].kind === "compaction") {
      index = itemIndex;
      break;
    }
  }
  if (index === -1) return items;
  return items.map((item, itemIndex) =>
    itemIndex === index && item.kind === "compaction" ? update(item) : item
  );
}

function upsertPart(
  assistant: Extract<TranscriptItem, { kind: "assistant" }>,
  part: AssistantPartView
): Extract<TranscriptItem, { kind: "assistant" }> {
  const index = assistant.parts.findIndex((item) => item.id === part.id);
  if (index === -1) return { ...assistant, parts: [...assistant.parts, part] };
  return {
    ...assistant,
    parts: assistant.parts.map((item, itemIndex) => itemIndex === index ? part : item)
  };
}

function updatePart(
  assistant: Extract<TranscriptItem, { kind: "assistant" }>,
  id: string,
  fallback: AssistantPartView,
  update: (part: AssistantPartView) => AssistantPartView
): Extract<TranscriptItem, { kind: "assistant" }> {
  const index = assistant.parts.findIndex((part) => part.id === id);
  if (index === -1) return { ...assistant, parts: [...assistant.parts, update(fallback)] };
  return {
    ...assistant,
    parts: assistant.parts.map((part, partIndex) => partIndex === index ? update(part) : part)
  };
}

function textPartID(id: string, type: "text" | "reasoning", ordinal: unknown): string {
  return `${id}:${type}:${Number(ordinal ?? 0)}`;
}

function initialTool(id: string, title: string, created: number): ToolCallView {
  return {
    id,
    title: title || "tool",
    detail: "",
    status: "running",
    startedAt: created
  };
}

function updateTool(
  items: TranscriptItem[],
  event: ChatStreamEvent,
  update: (tool: ToolCallView) => ToolCallView
): TranscriptItem[] {
  const id = messageID(event.data);
  const callID = toolID(event.data);
  if (!id || !callID) return items;
  const partID = `${id}:tool:${callID}`;
  return updateAssistant(items, id, event.created, (assistant) =>
    updatePart(
      assistant,
      partID,
      { kind: "tool", id: partID, tool: initialTool(callID, "tool", event.created) },
      (part) => part.kind === "tool" ? { ...part, tool: update(part.tool) } : part
    )
  );
}

function partFromProjection(part: Record<string, any>, created: number): AssistantPartView | null {
  const id = String(part.id ?? "");
  if (!id) return null;
  if (part.type === "text" || part.type === "reasoning") {
    return {
      kind: part.type,
      id,
      text: String(part.text ?? ""),
      complete: Boolean(part.time?.end ?? part.time?.completed)
    };
  }
  if (part.type !== "tool") return null;
  const state = (part.state ?? {}) as Record<string, any>;
  const input = state.input;
  const status = state.status === "error" ? "failed" : state.status === "completed" ? "success" : "running";
  const startedAt = Number(part.time?.created ?? state.time?.start ?? created);
  const completedAt = Number(part.time?.completed ?? state.time?.end ?? 0);
  const output = Array.isArray(state.content)
    ? toolOutput({ content: state.content })
    : state.status === "completed"
      ? stringify(state.output)
      : errorText(state.error);
  const callID = String(part.callID ?? part.id);
  return {
    kind: "tool",
    id,
    tool: {
      id: callID,
      title: String(part.name ?? part.tool ?? inferTool(input)),
      detail: toolDetail(input),
      status,
      input: stringify(input),
      output,
      startedAt,
      ...(completedAt ? { duration: Math.max(0, completedAt - startedAt) } : {}),
      paths: paths(input),
      metadata: metadata(state.metadata),
      inputValue: input,
      content: toolContent(state),
      ...(typeof part.executed === "boolean" ? { executed: part.executed } : {}),
      providerState: metadata(part.providerState),
      providerResultState: metadata(part.providerResultState)
    }
  };
}

export function reduceChatStream(items: TranscriptItem[], event: ChatStreamEvent): TranscriptItem[] {
  const data = event.data;
  const id = messageID(data);
  switch (event.type) {
    case "session.input.admitted": {
      const input = data.input as Record<string, any> | undefined;
      const payload = input?.data as Record<string, any> | undefined;
      const inputID = String(data.inputID ?? event.id);
      if (!input || !payload) return items;
      if (input.type === "user") {
        const files = Array.isArray(payload.files) ? payload.files as Record<string, unknown>[] : [];
        const attachments = files.flatMap((file): { name: string }[] =>
          typeof file.name === "string" && file.name ? [{ name: file.name }] : []
        );
        const item: Extract<TranscriptItem, { kind: "user" }> = {
          kind: "user",
          id: inputID,
          text: String(payload.text ?? ""),
          ...(attachments.length > 0 ? { attachments } : {})
        };
        const optimistic = items.findIndex((current) =>
          current.kind === "user" && current.id.startsWith("user-") && current.text === item.text
        );
        if (optimistic >= 0) {
          return items.map((current, index) => index === optimistic ? item : current);
        }
        return upsertItem(items, item);
      }
      if (input.type === "synthetic") {
        return upsertItem(items, {
          kind: "synthetic",
          id: inputID,
          text: String(payload.text ?? ""),
          ...(typeof payload.description === "string" ? { description: payload.description } : {})
        });
      }
      return items;
    }
    case "session.input.cancelled":
      return items.filter((item) => item.id !== String(data.inputID ?? ""));
    case "session.input.promoted":
      return items;
    case "session.agent.selected":
      return upsertItem(items, {
        kind: "selection",
        id: event.id,
        selection: "agent",
        title: "Agent switched",
        detail: String(data.agent ?? "")
      });
    case "session.model.selected": {
      const model = data.model as Record<string, unknown> | undefined;
      const detail = [model?.providerID, model?.id].filter((part) => typeof part === "string" && part).join(" / ");
      return upsertItem(items, {
        kind: "selection",
        id: event.id,
        selection: "model",
        title: "Model switched",
        detail
      });
    }
    case "session.synthetic":
      return upsertItem(items, {
        kind: "synthetic",
        id: event.id,
        text: String(data.text ?? ""),
        ...(typeof data.description === "string" ? { description: data.description } : {})
      });
    case "session.skill.activated":
      return upsertItem(items, {
        kind: "skill",
        id: event.id,
        skill: String(data.id ?? ""),
        name: String(data.name ?? data.id ?? "Skill"),
        text: String(data.text ?? "")
      });
    case "session.shell.started": {
      const shell = data.shell as Record<string, any> | undefined;
      if (!shell) return items;
      return upsertItem(items, {
        kind: "shell",
        id: event.id,
        shellID: String(shell.id ?? event.id),
        command: String(shell.command ?? ""),
        status: "running"
      });
    }
    case "session.shell.ended": {
      const shell = data.shell as Record<string, any> | undefined;
      if (!shell) return items;
      const shellID = String(shell.id ?? "");
      const output = data.output as Record<string, unknown> | undefined;
      const index = items.findIndex((item) => item.kind === "shell" && item.shellID === shellID);
      const item: Extract<TranscriptItem, { kind: "shell" }> = {
        kind: "shell",
        id: index >= 0 ? items[index].id : event.id,
        shellID: shellID || event.id,
        command: String(shell.command ?? ""),
        status: ["exited", "timeout", "killed"].includes(String(shell.status))
          ? shell.status as "exited" | "timeout" | "killed"
          : "exited",
        ...(typeof output?.output === "string" ? { output: output.output } : {}),
        ...(typeof shell.exit === "number" ? { exit: shell.exit } : {})
      };
      return index >= 0
        ? items.map((current, itemIndex) => itemIndex === index ? item : current)
        : [...items, item];
    }
    case "session.compaction.started":
      return upsertItem(items, {
        kind: "compaction",
        id: event.id,
        status: "running",
        reason: data.reason === "manual" ? "manual" : "auto",
        summary: "",
        recent: String(data.recent ?? "")
      });
    case "session.compaction.delta":
      return updateLatestCompaction(items, (item) => ({
        ...item,
        summary: item.summary + String(data.text ?? "")
      }));
    case "session.compaction.ended": {
      const updated = updateLatestCompaction(items, (item) => ({
        ...item,
        status: "completed",
        reason: data.reason === "manual" ? "manual" : "auto",
        summary: String(data.text ?? item.summary),
        recent: String(data.recent ?? item.recent ?? "")
      }));
      return updated === items
        ? [...items, {
            kind: "compaction",
            id: event.id,
            status: "completed",
            reason: data.reason === "manual" ? "manual" : "auto",
            summary: String(data.text ?? ""),
            recent: String(data.recent ?? "")
          }]
        : updated;
    }
    case "session.compaction.failed": {
      const updated = updateLatestCompaction(items, (item) => ({
        ...item,
        status: "failed",
        reason: data.reason === "manual" ? "manual" : "auto",
        error: errorText(data.error) || "Compaction failed"
      }));
      return updated === items
        ? [...items, {
            kind: "compaction",
            id: event.id,
            status: "failed",
            reason: data.reason === "manual" ? "manual" : "auto",
            summary: "",
            error: errorText(data.error) || "Compaction failed"
          }]
        : updated;
    }
    case "session.step.started":
      return updateAssistant(
        items.map((item) =>
          item.kind === "assistant" && item.messageID !== id && !item.completed
            ? { ...item, completed: true, retry: undefined }
            : item
        ),
        id,
        event.created,
        (assistant) => ({
        ...assistant,
        completed: false,
        retry: undefined,
        error: undefined
        })
      );
    case "session.step.ended":
      return updateAssistant(items, id, event.created, (assistant) => ({ ...assistant, completed: true }));
    case "session.step.failed":
      return updateAssistant(items, id, event.created, (assistant) => ({
        ...assistant,
        completed: true,
        retry: undefined,
        error: errorText(data.error) || "Step failed"
      }));
    case "session.text.started": {
      const partID = textPartID(id, "text", data.ordinal);
      return updateAssistant(items, id, event.created, (assistant) =>
        upsertPart(assistant, { kind: "text", id: partID, text: "", complete: false })
      );
    }
    case "session.text.delta": {
      const partID = textPartID(id, "text", data.ordinal);
      return updateAssistant(items, id, event.created, (assistant) =>
        updatePart(
          assistant,
          partID,
          { kind: "text", id: partID, text: "", complete: false },
          (part) => part.kind === "text" ? { ...part, text: part.text + String(data.delta ?? "") } : part
        )
      );
    }
    case "session.text.ended": {
      const partID = textPartID(id, "text", data.ordinal);
      return updateAssistant(items, id, event.created, (assistant) =>
        updatePart(
          assistant,
          partID,
          { kind: "text", id: partID, text: "", complete: true },
          (part) => part.kind === "text"
            ? { ...part, text: String(data.text ?? ""), complete: true }
            : part
        )
      );
    }
    case "session.reasoning.started": {
      const partID = textPartID(id, "reasoning", data.ordinal);
      return updateAssistant(items, id, event.created, (assistant) =>
        upsertPart(assistant, { kind: "reasoning", id: partID, text: "", complete: false })
      );
    }
    case "session.reasoning.delta": {
      const partID = textPartID(id, "reasoning", data.ordinal);
      return updateAssistant(items, id, event.created, (assistant) =>
        updatePart(
          assistant,
          partID,
          { kind: "reasoning", id: partID, text: "", complete: false },
          (part) => part.kind === "reasoning"
            ? { ...part, text: part.text + String(data.delta ?? "") }
            : part
        )
      );
    }
    case "session.reasoning.ended": {
      const partID = textPartID(id, "reasoning", data.ordinal);
      return updateAssistant(items, id, event.created, (assistant) =>
        updatePart(
          assistant,
          partID,
          { kind: "reasoning", id: partID, text: "", complete: true },
          (part) => part.kind === "reasoning"
            ? { ...part, text: String(data.text ?? ""), complete: true }
            : part
        )
      );
    }
    case "session.tool.input.started":
      return updateTool(items, event, (tool) => ({
        ...tool,
        title: String(data.name ?? tool.title),
        input: "",
        startedAt: event.created
      }));
    case "session.tool.input.delta":
      return updateTool(items, event, (tool) => ({ ...tool, input: (tool.input ?? "") + String(data.delta ?? "") }));
    case "session.tool.input.ended":
      return updateTool(items, event, (tool) => ({ ...tool, input: String(data.text ?? tool.input ?? "") }));
    case "session.tool.called":
      return updateTool(items, event, (tool) => {
        const input = data.input;
        return {
          ...tool,
          title: tool.title === "tool" ? inferTool(input) : tool.title,
          detail: toolDetail(input),
          input: stringify(input),
          inputValue: input,
          paths: paths(input),
          metadata: metadata(data.metadata) ?? tool.metadata,
          ...(typeof data.executed === "boolean" ? { executed: data.executed } : {}),
          providerState: metadata(data.state) ?? tool.providerState,
          startedAt: tool.startedAt ?? event.created
        };
      });
    case "session.tool.progress":
      return updateTool(items, event, (tool) => ({
        ...tool,
        progress: stringify(data.progress ?? data.metadata),
        metadata: metadata(data.metadata) ?? tool.metadata
      }));
    case "session.tool.success":
      return updateTool(items, event, (tool) => tool.status === "running"
        ? {
            ...tool,
            status: "success",
            output: toolOutput(data),
            content: toolContent(data),
            metadata: metadata(data.metadata) ?? tool.metadata,
            ...(typeof data.executed === "boolean" ? { executed: data.executed } : {}),
            providerResultState: metadata(data.resultState) ?? tool.providerResultState,
            progress: undefined,
            duration: Math.max(0, event.created - (tool.startedAt ?? event.created))
          }
        : tool);
    case "session.tool.failed":
      return updateTool(items, event, (tool) => tool.status === "running"
        ? {
            ...tool,
            status: "failed",
            output: toolOutput(data) || errorText(data.error) || "Tool failed",
            content: toolContent(data),
            metadata: metadata(data.metadata) ?? tool.metadata,
            ...(typeof data.executed === "boolean" ? { executed: data.executed } : {}),
            providerResultState: metadata(data.resultState) ?? tool.providerResultState,
            progress: undefined,
            duration: Math.max(0, event.created - (tool.startedAt ?? event.created))
          }
        : tool);
    case "session.retry.scheduled":
      return updateAssistant(items, id, event.created, (assistant) => ({
        ...assistant,
        retry: {
          attempt: Number(data.attempt ?? 1),
          message: errorText(data.error) || "Retrying",
          next: Number(data.at ?? data.next ?? 0) || undefined
        }
      }));
    case "message.updated": {
      const info = data.info as Record<string, any> | undefined;
      if (!info || (info.role !== "assistant" && info.type !== "assistant")) return items;
      const assistantID = String(info.id ?? "");
      return updateAssistant(items, assistantID, Number(info.time?.created ?? event.created), (assistant) => ({
        ...assistant,
        completed: Boolean(info.time?.completed ?? info.finish),
        error: errorText(info.error) || undefined
      }));
    }
    case "message.removed":
      return items.filter((item) => item.kind !== "assistant" || item.messageID !== String(data.messageID ?? ""));
    case "message.part.updated": {
      const projection = (data.part ?? data) as Record<string, any>;
      const assistantID = String(projection.messageID ?? data.messageID ?? "");
      const part = partFromProjection(projection, event.created);
      if (!assistantID || !part) return items;
      if (typeof data.delta === "string" && (part.kind === "text" || part.kind === "reasoning")) {
        part.text = part.text.endsWith(data.delta) ? part.text : part.text + data.delta;
      }
      return updateAssistant(items, assistantID, event.created, (assistant) => upsertPart(assistant, part));
    }
    case "message.part.delta": {
      if (data.field && data.field !== "text") return items;
      const assistantID = String(data.messageID ?? "");
      const partID = String(data.partID ?? "");
      if (!assistantID || !partID) return items;
      return updateAssistant(items, assistantID, event.created, (assistant) =>
        updatePart(
          assistant,
          partID,
          { kind: "text", id: partID, text: "", complete: false },
          (part) => part.kind === "text" || part.kind === "reasoning"
            ? { ...part, text: part.text + String(data.delta ?? "") }
            : part
        )
      );
    }
    case "message.part.removed": {
      const assistantID = String(data.messageID ?? "");
      const partID = String(data.partID ?? "");
      return updateAssistant(items, assistantID, event.created, (assistant) => ({
        ...assistant,
        parts: assistant.parts.filter((part) => part.id !== partID)
      }));
    }
    case "session.execution.succeeded":
    case "session.execution.failed":
    case "session.execution.interrupted":
    case "session.idle":
      return updateLatestAssistant(items, (assistant) => ({ ...assistant, completed: true, retry: undefined }));
    default:
      return items;
  }
}

function mergeAssistantPart(history: AssistantPartView, live: AssistantPartView): AssistantPartView {
  if (history.kind !== live.kind) return live;
  if (history.kind === "text" && live.kind === "text") {
    return {
      ...live,
      text: live.text.length >= history.text.length ? live.text : history.text,
      complete: history.complete || live.complete
    };
  }
  if (history.kind === "reasoning" && live.kind === "reasoning") {
    return {
      ...live,
      text: live.text.length >= history.text.length ? live.text : history.text,
      complete: history.complete || live.complete
    };
  }
  if (history.kind !== "tool" || live.kind !== "tool") return live;
  const historyTerminal = history.tool.status !== "running";
  const liveTerminal = live.tool.status !== "running";
  if (historyTerminal && !liveTerminal) return history;
  return { ...history, ...live, tool: { ...history.tool, ...live.tool } };
}

function mergeAssistant(
  history: Extract<TranscriptItem, { kind: "assistant" }>,
  live: Extract<TranscriptItem, { kind: "assistant" }>
): Extract<TranscriptItem, { kind: "assistant" }> {
  const parts = [...history.parts];
  for (const livePart of live.parts) {
    const index = parts.findIndex((part) => part.id === livePart.id);
    if (index === -1) parts.push(livePart);
    else parts[index] = mergeAssistantPart(parts[index], livePart);
  }
  return {
    ...history,
    ...live,
    parts,
    completed: history.completed || live.completed,
    retry: live.retry ?? history.retry,
    error: live.error ?? history.error
  };
}

export function mergeChatHistory(history: TranscriptItem[], live: TranscriptItem[]): TranscriptItem[] {
  const result = [...history];
  for (const item of live) {
    const index = result.findIndex((current) =>
      current.id === item.id || (
        current.kind === "assistant" && item.kind === "assistant" && current.messageID === item.messageID
      )
    );
    if (index === -1) {
      result.push(item);
      continue;
    }
    const current = result[index];
    result[index] = current.kind === "assistant" && item.kind === "assistant"
      ? mergeAssistant(current, item)
      : item;
  }
  return result;
}

function deltaKey(event: ChatStreamEvent): string | null {
  const data = event.data;
  if (event.type === "session.text.delta" || event.type === "session.reasoning.delta") {
    return `${event.type}:${data.sessionID}:${data.assistantMessageID}:${data.ordinal ?? 0}`;
  }
  if (event.type === "session.tool.input.delta") {
    return `${event.type}:${data.sessionID}:${data.assistantMessageID}:${toolID(data)}`;
  }
  if (event.type === "message.part.delta") {
    return `${event.type}:${data.sessionID}:${data.messageID}:${data.partID}:${data.field}`;
  }
  return null;
}

export function coalesceChatStream(events: ChatStreamEvent[]): ChatStreamEvent[] {
  const result: ChatStreamEvent[] = [];
  for (const event of events) {
    const key = deltaKey(event);
    const previous = result.at(-1);
    if (key && previous && deltaKey(previous) === key) {
      result[result.length - 1] = {
        ...event,
        data: {
          ...event.data,
          delta: String(previous.data.delta ?? "") + String(event.data.delta ?? "")
        }
      };
      continue;
    }
    if (event.type === "message.part.updated" && previous?.type === "message.part.updated") {
      const currentPart = event.data.part as Record<string, any> | undefined;
      const previousPart = previous.data.part as Record<string, any> | undefined;
      if (
        currentPart?.id &&
        previousPart?.id &&
        currentPart.id === previousPart.id &&
        currentPart.messageID === previousPart.messageID
      ) {
        result[result.length - 1] = event;
        continue;
      }
    }
    result.push(event);
  }
  return result;
}
