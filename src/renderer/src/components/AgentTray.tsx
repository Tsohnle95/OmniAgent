import { type ReactNode } from "react";
import { IconSymbolEvent } from "./icons";

export function AgentTray({
  busy,
  label,
  onExpand,
  onResizeLeft,
  onResizeRight
}: {
  busy: boolean;
  label: string;
  onExpand: () => void;
  onResizeLeft: (e: React.MouseEvent) => void;
  onResizeRight?: (e: React.MouseEvent) => void;
}): ReactNode {
  return (
    <div className="agent-tray">
      <div className="panel-resize-handle panel-resize-left panel-resize-collapsed" onMouseDown={onResizeLeft} />
      <span className={`agent-dot ${busy ? "busy" : ""}`} />
      <button
        className="activity-btn agent-tray-model"
        title={`Show agent panel — ${label}`}
        aria-label={`Show agent panel — ${label}`}
        onClick={onExpand}
      >
        <IconSymbolEvent />
      </button>
      {onResizeRight && <div className="panel-resize-handle panel-resize-right panel-resize-collapsed" onMouseDown={onResizeRight} />}
    </div>
  );
}
