import type { AssistantPartView, ToolCallView } from "@shared/types";
import type { SessionActivityResult, SessionActivityPhase } from "./session-activity";

export type AssistantActivity = "idle" | "streaming" | "tooling" | "cooldown" | "permission";

export type AssistantStreamPhase = "streaming" | "cooldown" | "completed";

export interface ParsedStatusResult {
  activePartType: "text" | "tool" | "reasoning" | "editing" | undefined;
  activeToolName: string | undefined;
  statusText: string;
  isGenericStatus: boolean;
}

export interface WorkingSummary {
  activity: AssistantActivity;
  hasWorkingContext: boolean;
  hasActiveTools: boolean;
  isWorking: boolean;
  isStreaming: boolean;
  isCooldown: boolean;
  lifecyclePhase: AssistantStreamPhase | null;
  statusText: string | null;
  isGenericStatus: boolean;
  isWaitingForPermission: boolean;
  canAbort: boolean;
  compactionDeadline: number | null;
  activePartType?: "text" | "tool" | "reasoning" | "editing";
  activeToolName?: string;
  wasAborted: boolean;
  abortActive: boolean;
  lastCompletionId: string | null;
  isComplete: boolean;
  retryInfo: { attempt?: number; next?: number } | null;
}

const EMPTY_PARTS: AssistantPartView[] = [];
const EDITING_TOOLS = new Set(["edit", "write", "multiedit", "apply_patch"]);
const TOOL_STATUS_PHRASES: Record<string, string> = {
  read: "reading file",
  write: "writing file",
  edit: "editing file",
  multiedit: "editing files",
  apply_patch: "applying patch",
  bash: "running command",
  grep: "searching content",
  glob: "finding files",
  list: "listing directory",
  task: "delegating task",
  webfetch: "fetching URL",
  websearch: "searching web",
  codesearch: "web code search",
  todowrite: "updating todos",
  todoread: "reading todos",
  skill: "learning skill",
  question: "asking question",
  plan_enter: "switching to planning",
  plan_exit: "switching to building"
};
const WORKING_PHRASES = [
  "working",
  "processing",
  "preparing",
  "warming up",
  "gears turning",
  "computing",
  "calculating",
  "analyzing",
  "wheels spinning",
  "calibrating",
  "synthesizing",
  "connecting dots",
  "inspecting logic",
  "weighing options"
];

const getToolStatusPhrase = (toolName: string): string => {
  return TOOL_STATUS_PHRASES[toolName] ?? `using ${toolName}`;
};

const hashString = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const getStableWorkingPhrase = (key: string): string => {
  return WORKING_PHRASES[hashString(key) % WORKING_PHRASES.length] ?? "working";
};

function getToolDisplayName(tool: ToolCallView): string {
  return tool.title;
}

function partComplete(part: AssistantPartView): boolean {
  if (part.kind === "tool") return part.tool.status !== "running";
  return part.complete;
}

function textContent(part: AssistantPartView): string | undefined {
  if (part.kind === "text" || part.kind === "reasoning") return part.text;
  return undefined;
}

export function createParsedStatus(parts: AssistantPartView[], genericKey: string): ParsedStatusResult {
  let activePartType: ParsedStatusResult["activePartType"] = undefined;
  let activeToolName: string | undefined = undefined;

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (!part) continue;

    switch (part.kind) {
      case "reasoning": {
        if (!partComplete(part) && !activePartType) {
          activePartType = "reasoning";
        }
        break;
      }
      case "tool": {
        const toolStatus = part.tool.status;
        if (toolStatus === "running" && !activePartType) {
          const toolName = getToolDisplayName(part.tool);
          if (EDITING_TOOLS.has(toolName)) {
            activePartType = "editing";
            activeToolName = toolName;
          } else {
            activePartType = "tool";
            activeToolName = toolName;
          }
        }
        break;
      }
      case "text": {
        const rawContent = textContent(part) ?? "";
        if (rawContent.trim().length > 0 && !partComplete(part) && !activePartType) {
          activePartType = "text";
        }
        break;
      }
      default:
        break;
    }
  }

  const isGenericStatus = activePartType === undefined;
  const statusText = (() => {
    if (activePartType === "editing") return activeToolName === "multiedit" ? getToolStatusPhrase(activeToolName) : "editing file";
    if (activePartType === "tool" && activeToolName) return getToolStatusPhrase(activeToolName);
    if (activePartType === "reasoning") return "thinking";
    if (activePartType === "text") return "composing";
    return getStableWorkingPhrase(genericKey);
  })();

  return { activePartType, activeToolName, statusText, isGenericStatus };
}

export function resolveAssistantStatus(input: {
  assistantId: string | null;
  activity: SessionActivityResult;
  parts: AssistantPartView[];
  pendingPermissions: number;
  retryInfo: { attempt?: number; next?: number } | null;
}): WorkingSummary | null {
  const { assistantId, activity, parts, pendingPermissions, retryInfo } = input;
  if (!assistantId) return null;

  const genericKey = `${assistantId}`;
  const parsedStatus = createParsedStatus(parts ?? EMPTY_PARTS, genericKey);

  const isWorking = activity.isWorking;
  const isStreaming = activity.phase === "busy";
  const isCooldown = false;
  const isRetry = activity.phase === "retry";

  let activityKind: AssistantActivity = "idle";
  if (isWorking) {
    if (parsedStatus.activePartType === "tool" || parsedStatus.activePartType === "editing") {
      activityKind = "tooling";
    } else {
      activityKind = isCooldown ? "cooldown" : "streaming";
    }
  }

  const baseWorking: WorkingSummary = {
    activity: activityKind,
    hasWorkingContext: isWorking,
    hasActiveTools: parsedStatus.activePartType === "tool" || parsedStatus.activePartType === "editing",
    isWorking,
    isStreaming,
    isCooldown,
    lifecyclePhase: isStreaming ? "streaming" : isCooldown ? "cooldown" : null,
    statusText: isWorking ? parsedStatus.statusText : null,
    isGenericStatus: isWorking ? parsedStatus.isGenericStatus : true,
    isWaitingForPermission: false,
    canAbort: isWorking,
    compactionDeadline: null,
    activePartType: isWorking ? parsedStatus.activePartType : undefined,
    activeToolName: isWorking ? parsedStatus.activeToolName : undefined,
    wasAborted: false,
    abortActive: false,
    lastCompletionId: null,
    isComplete: false,
    retryInfo: isRetry ? { attempt: retryInfo?.attempt, next: retryInfo?.next } : null
  };

  if (pendingPermissions === 0) return baseWorking;

  return {
    ...baseWorking,
    statusText: "waiting for permission",
    isWaitingForPermission: true,
    canAbort: false,
    retryInfo: null
  };
}

export type { SessionActivityPhase };
