import { type ReactNode } from "react";

export function AgentTray({
  busy,
  label,
  onExpand,
  onDrag
}: {
  busy: boolean;
  label: string;
  onExpand: () => void;
  onDrag: (e: React.MouseEvent) => void;
}): ReactNode {
  return (
    <div className="agent-tray" onMouseDown={onDrag}>
      <span className={`agent-dot ${busy ? "busy" : ""}`} />
      <button
        className="activity-btn agent-tray-model"
        title={`Show agent panel — ${label}`}
        aria-label={`Show agent panel — ${label}`}
        onClick={onExpand}
      >
        <span className="codicon codicon-symbol-event" />
      </button>
    </div>
  );
}
