import { useEffect, useRef, useState, type ReactNode } from "react";
import { StoreProvider, useStore } from "./store";
import { Welcome } from "./components/Welcome";
import { FileSidebar } from "./components/FileSidebar";
import { EditorPane } from "./components/EditorPane";
import { AgentPanel } from "./components/AgentPanel";
import { TerminalTray } from "./components/TerminalTray";

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

function useTrayHeight(): [number, boolean, () => void, () => void, (e: React.MouseEvent) => void] {
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(240);
  const startRef = useRef<{ y: number; height: number } | null>(null);

  const onDrag = (e: React.MouseEvent): void => {
    e.preventDefault();
    startRef.current = { y: e.clientY, height };
    const move = (ev: MouseEvent): void => {
      if (!startRef.current) return;
      const dy = startRef.current.y - ev.clientY;
      const h = startRef.current.height + dy;
      if (h < 26) {
        setOpen(false);
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        return;
      }
      setHeight(Math.min(520, Math.max(34, h)));
      setOpen(true);
    };
    const up = (): void => {
      startRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const toggle = (): void => setOpen((o) => !o);
  const close = (): void => setOpen(false);
  return [height, open, toggle, close, onDrag];
}

function Layout({ children }: { children?: ReactNode }): ReactNode {
  const [sideW, sideDrag] = useDragResize(250, 170, 520);
  const [agentW, agentDrag] = useDragResize(420, 300, 760, true);
  const [trayH, trayOpen, toggleTray, closeTray, trayDrag] = useTrayHeight();

  return (
    <div className={`app ${trayOpen ? "tray-open" : ""}`}>
      <div className="titlebar">
        <span className="titlebar-title">OpenShell</span>
        <span className="titlebar-actions">
          <button
            className={`icon-btn ${trayOpen ? "on" : ""}`}
            title={trayOpen ? "Hide terminal (⌥O)" : "Show terminal (⌥O)"}
            onClick={toggleTray}
          >
            ▤
          </button>
        </span>
      </div>

      <div className="main-row" style={{ gridTemplateColumns: `${sideW}px 8px minmax(0,1fr) 8px ${agentW}px` }}>
        <FileSidebar />
        <div className="divider" onMouseDown={sideDrag} />
        <EditorPane />
        <div className="divider" onMouseDown={agentDrag} />
        <AgentPanel />
      </div>

      {trayOpen && (
        <>
          <div className="tray-divider" onMouseDown={trayDrag} title="Drag to resize" />
          <TerminalTray height={trayH} onClose={closeTray} />
        </>
      )}

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
  useEffect(() => {
    document.documentElement.classList.toggle(
      "darwin",
      window.openshell.platform === "darwin"
    );
  }, []);

  return (
    <StoreProvider>
      <Root />
    </StoreProvider>
  );
}

function Root(): ReactNode {
  const { session, toggleWordWrap } = useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === "KeyZ") {
        e.preventDefault();
        toggleWordWrap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleWordWrap]);

  if (!session) return <Welcome />;
  return <Layout />;
}
