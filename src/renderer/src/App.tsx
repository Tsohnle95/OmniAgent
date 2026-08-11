import { useEffect, useRef, useState, type ReactNode } from "react";
import { StoreProvider, useStore } from "./store";
import { Welcome } from "./components/Welcome";
import { FileSidebar } from "./components/FileSidebar";
import { EditorPane } from "./components/EditorPane";
import { AgentPanel } from "./components/AgentPanel";
import { AgentTray } from "./components/AgentTray";
import { TerminalTray } from "./components/TerminalTray";

const COLLAPSED_PANEL_W = 44;

function useDragResize(
  initial: number,
  min: number,
  max: number,
  flip: boolean,
  open: boolean,
  onOpen: () => void,
  onCollapse?: () => void
): [number, (e: React.MouseEvent) => void] {
  const [width, setWidth] = useState(initial);
  const startRef = useRef<{ x: number; width: number; open: boolean } | null>(null);
  const lastRawWRef = useRef(initial);

  const onMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault();
    const startedOpen = open;
    startRef.current = {
      x: e.clientX,
      width: startedOpen ? width : COLLAPSED_PANEL_W,
      open: startedOpen
    };
    lastRawWRef.current = startedOpen ? width : COLLAPSED_PANEL_W;
    const move = (ev: MouseEvent): void => {
      if (!startRef.current) return;
      const dx = ev.clientX - startRef.current.x;
      const rawW = startRef.current.width + (flip ? -dx : dx);
      lastRawWRef.current = rawW;

      if (!startRef.current.open) {
        if (rawW >= min) {
          setWidth(Math.min(max, rawW));
          onOpen();
        }
        return;
      }

      if (onCollapse && rawW <= COLLAPSED_PANEL_W) {
        const previousWidth = startRef.current.width;
        startRef.current = null;
        setWidth(previousWidth);
        onCollapse();
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        return;
      }

      setWidth(Math.min(max, Math.max(onCollapse ? COLLAPSED_PANEL_W : min, rawW)));
    };
    const up = (): void => {
      if (startRef.current) {
        const started = startRef.current;
        startRef.current = null;
        if (!started.open) {
          if (lastRawWRef.current >= min) {
            setWidth(Math.min(max, lastRawWRef.current));
            onOpen();
          }
        } else if (lastRawWRef.current < min) {
          setWidth(min);
        }
      }
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
  const belowThresholdRef = useRef(false);

  const onDrag = (e: React.MouseEvent): void => {
    e.preventDefault();
    startRef.current = { y: e.clientY, height };
    const move = (ev: MouseEvent): void => {
      if (!startRef.current) return;
      const dy = startRef.current.y - ev.clientY;
      const h = startRef.current.height + dy;
      belowThresholdRef.current = h < 26;
      setHeight(Math.min(520, Math.max(26, h)));
    };
    const up = (): void => {
      if (startRef.current) {
        startRef.current = null;
        if (belowThresholdRef.current) {
          setHeight(240);
          setOpen(false);
        }
      }
      belowThresholdRef.current = false;
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
  const [sideOpen, setSideOpen] = useState(true);
  const [sideW, sideDrag] = useDragResize(250, 170, 520, false, sideOpen, () => setSideOpen(true));
  const [agentOpen, setAgentOpen] = useState(true);
  const [agentW, agentDrag] = useDragResize(
    420,
    300,
    760,
    true,
    agentOpen,
    () => setAgentOpen(true),
    () => setAgentOpen(false)
  );
  const [trayH, trayOpen, toggleTray, closeTray, trayDrag] = useTrayHeight();

  const cols = [
    sideOpen ? `${sideW}px` : `${COLLAPSED_PANEL_W}px`,
    "8px",
    "minmax(0,1fr)",
    "8px",
    agentOpen ? `${agentW}px` : `${COLLAPSED_PANEL_W}px`
  ].join(" ");

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

      <div className="main-row" style={{ gridTemplateColumns: cols }}>
        <FileSidebar collapsed={!sideOpen} onCollapse={setSideOpen} />
        <div className={`divider ${sideOpen ? "" : "collapsed"}`} onMouseDown={sideDrag} />
        <EditorPane />
        {agentOpen ? (
          <>
            <div className="divider" onMouseDown={agentDrag} />
            <AgentPanel onCollapse={() => setAgentOpen(false)} />
          </>
        ) : (
          <>
            <div className="divider collapsed" onMouseDown={agentDrag} />
            <AgentTray onExpand={() => setAgentOpen(true)} />
          </>
        )}
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
