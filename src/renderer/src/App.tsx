import { useRef, useState, type ReactNode } from "react";
import { StoreProvider, useStore } from "./store";
import { Welcome } from "./components/Welcome";
import { FileSidebar } from "./components/FileSidebar";
import { EditorPane } from "./components/EditorPane";
import { AgentPanel } from "./components/AgentPanel";

function useDragResize(
  initial: number,
  min: number,
  max: number,
  flip = false
): [number, (e: React.MouseEvent) => void] {
  const [width, setWidth] = useState(initial);
  const startRef = useRef<{ x: number; width: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault();
    startRef.current = { x: e.clientX, width };
    const move = (ev: MouseEvent): void => {
      if (!startRef.current) return;
      const dx = ev.clientX - startRef.current.x;
      const w = Math.min(max, Math.max(min, startRef.current.width + (flip ? -dx : dx)));
      setWidth(w);
    };
    const up = (): void => {
      startRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return [width, onMouseDown];
}

function Layout({ children }: { children?: ReactNode }): ReactNode {
  const [sideW, sideDrag] = useDragResize(250, 170, 520);
  const [agentW, agentDrag] = useDragResize(420, 300, 760, true);
  const { session, busy } = useStore();

  return (
    <div className="app" style={{ gridTemplateColumns: `${sideW}px 8px 1fr 8px ${agentW}px` }}>
      <FileSidebar />
      <div className="divider" onMouseDown={sideDrag} />
      <EditorPane />
      <div className="divider" onMouseDown={agentDrag} />
      <AgentPanel />

      <div className="titlebar">
        <span className="titlebar-title">OpenShell</span>
        {session && (
          <span className="titlebar-dir" title={session.directory}>
            {session.directory}
          </span>
        )}
        <span className={`titlebar-status ${busy ? "busy" : ""}`}>
          {busy ? "● working" : session ? "○ idle" : "no session"}
        </span>
      </div>
      <Toasts />
    </div>
  );
}

function Toasts(): ReactNode {
  const { toasts } = useStore();
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export default function App(): ReactNode {
  return (
    <StoreProvider>
      <Root />
    </StoreProvider>
  );
}

function Root(): ReactNode {
  const { session } = useStore();
  if (!session) return <Welcome />;
  return <Layout />;
}
