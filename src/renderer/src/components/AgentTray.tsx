import { type ReactNode } from "react";
import { useStore } from "../store";

export function AgentTray({ onExpand }: { onExpand: () => void }): ReactNode {
  const { busy, currentModel } = useStore();
  return (
    <div className="agent-tray">
      <div className="agent-tray-status">
        <span className={`agent-dot ${busy ? "busy" : ""}`} />
        <span className="agent-tray-label">Agent</span>
      </div>
      <button className="agent-tray-model" title="Show agent panel" onClick={onExpand}>
        <span className="codicon codicon-symbol-event" />
        <span className="agent-tray-model-name">{currentModel?.name ?? "Model"}</span>
        <span className="codicon codicon-chevron-down" />
      </button>
    </div>
  );
}
