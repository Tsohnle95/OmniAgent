import { useEffect, useRef, useState, type ReactNode } from "react";
import type { WorkspaceIdentity } from "@shared/types";

export function AgentTui({
  workspace,
  onError
}: {
  workspace: WorkspaceIdentity;
  onError: (message: string) => void;
}): ReactNode {
  const onErrorRef = useRef(onError);
  const [launching, setLaunching] = useState(true);
  onErrorRef.current = onError;

  const launch = (): void => {
    setLaunching(true);
    void window.openshell.agentTuiStart(workspace)
      .catch((error: unknown) => {
        onErrorRef.current(error instanceof Error ? error.message : "Could not open Kitty for the agent TUI");
      })
      .finally(() => setLaunching(false));
  };

  useEffect(() => {
    launch();
  }, [workspace.id, workspace.generation]);

  return (
    <div className="agent-tui">
      <div className="agent-kitty-card">
        <div className="agent-kitty-title">{launching ? "Opening Kitty…" : "Agent TUI opened in Kitty"}</div>
        <div className="agent-kitty-copy">Your Kitty profile, font, transparency, and blur settings are active in the new window.</div>
        <button className="btn" onClick={launch} disabled={launching}>Open Kitty again</button>
      </div>
    </div>
  );
}
