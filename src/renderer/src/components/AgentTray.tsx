import { type ReactNode } from "react";
import { useStore } from "../store";

export function AgentTray({ onExpand }: { onExpand: () => void }): ReactNode {
  const { busy, currentModel } = useStore();
  const label = currentModel?.name ?? "Model";
  return (
    <div className="agent-tray">
      <span className={`agent-dot ${busy ? "busy" : ""}`} />
      <button className="agent-tray-model" title={`Show agent panel — ${label}`} onClick={onExpand}>
        <span className="codicon codicon-symbol-event" />
        <span className="agent-tray-model-name">{label}</span>
      </button>
    </div>
  );
}
