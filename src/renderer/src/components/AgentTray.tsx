import { type ReactNode } from "react";

export function AgentTray({
  busy,
  label,
  onExpand,
  onDrag,
  onResizeLeft,
  onResizeRight
}: {
  busy: boolean;
  label: string;
  onExpand: () => void;
  onDrag: (e: React.MouseEvent) => void;
  onResizeLeft: (e: React.MouseEvent) => void;
  onResizeRight: (e: React.MouseEvent) => void;
}): ReactNode {
  return (
    <div className="agent-tray">
      <div className="panel-resize-handle panel-resize-left" onMouseDown={onResizeLeft} />
      <span className={`agent-dot ${busy ? "busy" : ""}`} />
      <button
        className="activity-btn agent-tray-model"
        title={`Show agent panel — ${label}`}
        aria-label={`Show agent panel — ${label}`}
        onClick={onExpand}
      >
        <span className="codicon codicon-symbol-event" />
      </button>
      <div className="panel-resize-handle panel-resize-right" onMouseDown={onResizeRight} />
    </div>
  );
}
