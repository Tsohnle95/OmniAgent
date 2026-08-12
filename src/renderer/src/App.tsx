import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { StoreProvider, useStore } from "./store";
import { Welcome } from "./components/Welcome";
import { FileSidebar } from "./components/FileSidebar";
import { EditorPane } from "./components/EditorPane";
import { AgentPanel } from "./components/AgentPanel";
import { AgentTray } from "./components/AgentTray";
import { TerminalTray } from "./components/TerminalTray";

const COLLAPSED_PANEL_W = 44;
const SIDE_MIN_W = 170;
const SIDE_MAX_W = 520;
const AGENT_DEFAULT_W = 280;
const AGENT_MIN_W = 300;

function useDragResize(
  width: number,
  setWidth: React.Dispatch<React.SetStateAction<number>>,
  min: number,
  max: number,
  flip: boolean,
  open: boolean,
  onOpen: () => void,
  onCollapse?: () => void
): (e: React.MouseEvent) => void {
  const startRef = useRef<{ x: number; width: number; open: boolean } | null>(null);

  const onMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault();
    const startedOpen = open;
    startRef.current = {
      x: e.clientX,
      width: startedOpen ? width : COLLAPSED_PANEL_W,
      open: startedOpen
    };
    const move = (ev: MouseEvent): void => {
      if (!startRef.current) return;
      const dx = ev.clientX - startRef.current.x;
      const rawW = startRef.current.width + (flip ? -dx : dx);
      if (onCollapse && rawW <= COLLAPSED_PANEL_W) {
        if (startRef.current.open) {
          startRef.current.open = false;
          onCollapse();
        }
        return;
      }

      if (rawW > COLLAPSED_PANEL_W || !onCollapse) {
        const nextW = onCollapse ? rawW : Math.max(min, rawW);
        setWidth(Math.min(max, nextW));
        if (!startRef.current.open) {
          startRef.current.open = true;
          onOpen();
        }
      }
    };
    const up = (): void => {
      if (startRef.current) startRef.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return onMouseDown;
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
  const [sideW, setSideW] = useState(250);
  const [agentOpen, setAgentOpen] = useState(true);
  const [agentW, setAgentW] = useState(AGENT_DEFAULT_W);
  const [trayH, trayOpen, toggleTray, closeTray, trayDrag] = useTrayHeight();
  const [winW, setWinW] = useState(() => window.innerWidth);

  useEffect(() => {
    const onResize = (): void => setWinW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const sideShown = sideOpen ? sideW : COLLAPSED_PANEL_W;
  const agentShown = agentOpen ? agentW : COLLAPSED_PANEL_W;
  const agentMax = Math.max(AGENT_MIN_W, winW - sideShown - 2);
  const sideMax = Math.max(SIDE_MIN_W, Math.min(SIDE_MAX_W, winW - agentShown - 2));

  const sideCapRef = useRef<number | null>(null);
  const agentCapRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const cap = Math.max(0, winW - sideShown - 2);
    const anchored = agentOpen && agentCapRef.current !== null && agentW >= agentCapRef.current - 1;
    agentCapRef.current = cap;
    if (anchored) setAgentW(cap);
    else setAgentW((w) => Math.min(w, cap));
  }, [winW, sideShown, agentOpen, agentW]);

  useLayoutEffect(() => {
    const cap = Math.max(0, Math.min(SIDE_MAX_W, winW - agentShown - 2));
    const anchored = sideOpen && sideCapRef.current !== null && sideW >= sideCapRef.current - 1;
    sideCapRef.current = cap;
    if (anchored) setSideW(cap);
    else setSideW((w) => Math.min(w, cap));
  }, [winW, agentShown, sideOpen, sideW]);

  const sideDrag = useDragResize(
    sideW,
    setSideW,
    SIDE_MIN_W,
    sideMax,
    false,
    sideOpen,
    () => setSideOpen(true),
    () => setSideOpen(false)
  );
  const agentDrag = useDragResize(
    agentW,
    setAgentW,
    AGENT_MIN_W,
    agentMax,
    true,
    agentOpen,
    () => setAgentOpen(true),
    () => setAgentOpen(false)
  );

  const cols = [
    sideOpen ? `${sideW}px` : `${COLLAPSED_PANEL_W}px`,
    "1px",
    "minmax(0,1fr)",
    "1px",
    agentOpen ? `${agentW}px` : `${COLLAPSED_PANEL_W}px`
  ].join(" ");

  const prevLayoutRef = useRef<{ sideOpen: boolean; sideW: number; agentOpen: boolean; agentW: number } | null>(null);
  const agentCap = Math.max(0, winW - sideShown - 2);
  const inAgentMode = prevLayoutRef.current !== null;

  useEffect(() => {
    if (prevLayoutRef.current === null) return;
    const stillInMode = !sideOpen && agentOpen && Math.abs(agentW - agentCap) < 2;
    if (!stillInMode) prevLayoutRef.current = null;
  }, [sideOpen, agentOpen, agentW, agentCap]);

  const toggleAgentMode = (): void => {
    if (prevLayoutRef.current === null) {
      prevLayoutRef.current = { sideOpen, sideW, agentOpen, agentW };
      setSideOpen(false);
      setAgentOpen(true);
      setAgentW(Math.max(0, winW - COLLAPSED_PANEL_W - 2));
    } else {
      const prev = prevLayoutRef.current;
      prevLayoutRef.current = null;
      setSideOpen(prev.sideOpen);
      setSideW(prev.sideW);
      setAgentOpen(prev.agentOpen);
      setAgentW(prev.agentW);
    }
  };

  return (
    <div className={`app ${trayOpen ? "tray-open" : ""}`}>
      <div className="titlebar">
        <span className="titlebar-title">OpenShell</span>
        <span className="titlebar-actions">
          <button
            className={`icon-btn ${inAgentMode ? "on" : ""}`}
            title={inAgentMode
              ? "Restore previous layout"
              : "Agent mode — collapse the sidebar and expand the agent panel to a single chat view"}
            onClick={toggleAgentMode}
          >
            <span className="codicon codicon-robot" />
          </button>
          <button
            className={`icon-btn ${trayOpen ? "on" : ""}`}
            title={trayOpen ? "Hide terminal (⌥O)" : "Show terminal (⌥O)"}
            onClick={toggleTray}
          >
            ▤
          </button>
        </span>
      </div>

      <div className="main-row" style={{ "--pane-columns": cols } as CSSProperties}>
        <FileSidebar collapsed={!sideOpen} onCollapse={setSideOpen} onDrag={sideDrag} />
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
            <AgentTray
              onExpand={() => {
                setAgentW(AGENT_DEFAULT_W);
                setAgentOpen(true);
              }}
              onDrag={agentDrag}
            />
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
