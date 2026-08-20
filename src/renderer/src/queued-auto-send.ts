import type { AgentOption, WorkspaceIdentity } from "@shared/types";
import { parseAgentMentions } from "./messages/agent-mentions";
import type { SessionAbortFlag } from "./assistant-status";
import type { QueuedMessage, MessageQueueTarget } from "./message-queue";

export const RECENT_ABORT_WINDOW_MS = 2000;

const AUTO_SEND_RETRY_BASE_DELAY_MS = 2000;
const AUTO_SEND_RETRY_MAX_DELAY_MS = 60000;

export type QueueStatusType = "idle" | "busy" | "retry";

export interface QueuedAutoSendFailure {
  messageId: string;
  failures: number;
  nextAttemptAt: number;
}

export const getQueuedAutoSendRetryDelayMs = (failures: number): number =>
  Math.min(AUTO_SEND_RETRY_BASE_DELAY_MS * 2 ** Math.max(failures - 1, 0), AUTO_SEND_RETRY_MAX_DELAY_MS);

export const isQueuedAutoSendBackedOff = (
  failure: QueuedAutoSendFailure | undefined,
  messageId: string,
  now: number
): boolean => failure !== undefined && failure.messageId === messageId && now < failure.nextAttemptAt;

export function createQueuedAutoSendRetryScheduler(
  onWake: () => void,
  now: () => number = Date.now,
  scheduleTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout> = setTimeout,
  cancelTimeout: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout
): {
  schedule: (retryAt: number) => void;
  dispose: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let scheduledAt: number | null = null;

  return {
    schedule(retryAt: number) {
      if (scheduledAt !== null && scheduledAt <= retryAt) return;
      if (timer !== null) cancelTimeout(timer);
      scheduledAt = retryAt;
      timer = scheduleTimeout(() => {
        timer = null;
        scheduledAt = null;
        onWake();
      }, Math.max(0, retryAt - now()));
    },
    dispose() {
      if (timer !== null) cancelTimeout(timer);
      timer = null;
      scheduledAt = null;
    }
  };
}

export const getAbortHoldUntil = (abortFlag: SessionAbortFlag | null | undefined, now = Date.now()): number | null => {
  if (!abortFlag) {
    return null;
  }
  const holdUntil = abortFlag.timestamp + RECENT_ABORT_WINDOW_MS;
  return now < holdUntil ? holdUntil : null;
};

export type QueuedAutoSendPayload = {
  queuedMessageId: string;
  primaryText: string;
  primaryAttachments: QueuedMessage["attachments"] & unknown[];
  agentMentionName?: string;
  sendConfig?: QueuedMessage["sendConfig"];
} | null;

export const buildQueuedAutoSendPayload = (queue: QueuedMessage[], agents: AgentOption[]): QueuedAutoSendPayload => {
  const queued = queue[0];
  if (!queued) {
    return null;
  }

  const { sanitizedText, mention } = parseAgentMentions(queued.content, agents);

  return {
    queuedMessageId: queued.id,
    primaryText: sanitizedText,
    primaryAttachments: queued.attachments ?? [],
    agentMentionName: mention?.name,
    sendConfig: queued.sendConfig
  };
};

export type ResolvedQueuedSendConfig = {
  providerID: string;
  modelID: string;
  agent?: string;
  variant?: string;
};

export const resolveSessionSendConfig = (selections: {
  agent?: string;
  providerID?: string;
  modelID?: string;
  variant?: string;
}): ResolvedQueuedSendConfig => {
  return {
    providerID: selections.providerID ?? "",
    modelID: selections.modelID ?? "",
    agent: selections.agent,
    variant: selections.variant
  };
};

export const sendQueuedAutoSendPayload = (
  workspace: WorkspaceIdentity,
  payload: NonNullable<QueuedAutoSendPayload>
): Promise<void> => {
  return window.openshell.prompt(workspace, payload.primaryText, payload.primaryAttachments ?? []).then(() => undefined);
};

export const shouldDispatchQueuedAutoSend = (
  previousStatusType: QueueStatusType | undefined,
  currentStatusType: QueueStatusType,
  hasQueuedItems = false
): boolean => {
  if (hasQueuedItems && currentStatusType === "idle") return true;
  return (previousStatusType === "busy" || previousStatusType === "retry")
    && currentStatusType === "idle";
};

export const resolveQueuedSessionStatusType = (input: {
  statusType: QueueStatusType | undefined;
  trailingAssistantIncomplete: boolean;
}): QueueStatusType => {
  const { statusType, trailingAssistantIncomplete } = input;
  if (statusType === "busy" || statusType === "retry") {
    return statusType;
  }
  if (trailingAssistantIncomplete) {
    return "busy";
  }
  return "idle";
};
