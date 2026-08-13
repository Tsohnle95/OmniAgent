import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { StoreProvider, usePanel, useStore } from "./store";
import type { SessionInfo } from "@shared/types";
import { Welcome } from "./components/Welcome";
import { FileSidebar } from "./components/FileSidebar";
import { EditorPane } from "./components/EditorPane";
import { AgentPanel } from "./components/AgentPanel";
import { AgentTray } from "./components/AgentTray";
import { TerminalTray } from "./components/TerminalTray";
import { RecoveryNotice } from "./components/RecoveryNotice";
import { SessionsTab } from "./components/SessionsTab";

const COLLAPSED_PANEL_W = 44;
const SIDE_MIN_W = 170;
const SIDE_MAX_W = 520;
const SIDE_DEFAULT_W = 280;
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

const TRAY_HEADER_H = 30;
const TRAY_SNAP_H = 32;

function useTrayHeight(): {
  height: number;
  open: boolean;
  snapped: boolean;
  dragging: boolean;
  toggle: () => void;
  close: () => void;
  expand: () => void;
  onDrag: (e: React.MouseEvent) => void;
} {
  const [open, setOpen] = useState(false);
  const [snapped, setSnapped] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [height, setHeight] = useState(240);
  const startRef = useRef<{ y: number; height: number; live: number } | null>(null);
  const lastFullRef = useRef(240);

  const onDrag = (e: React.MouseEvent): void => {
    e.preventDefault();
    if (startRef.current) return;
    startRef.current = { y: e.clientY, height, live: height };
    setDragging(true);
    const up = (): void => {
      if (startRef.current) {
        const h = startRef.current.live;
        startRef.current = null;
        if (h <= TRAY_SNAP_H) {
          setHeight(TRAY_HEADER_H);
          setSnapped(true);
        } else {
          setSnapped(false);
        }
        setOpen(true);
      }
      setDragging(false);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    const move = (ev: MouseEvent): void => {
      if (!startRef.current) return;
      if (ev.clientY >= window.innerHeight) {
        startRef.current = null;
        setDragging(false);
        setOpen(false);
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        return;
      }
      const dy = startRef.current.y - ev.clientY;
      const h = Math.min(520, Math.max(TRAY_HEADER_H, startRef.current.height + dy));
      startRef.current.live = h;
      if (h > TRAY_SNAP_H) lastFullRef.current = h;
      setHeight(h);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const expand = (): void => {
    setSnapped(false);
    setHeight(lastFullRef.current);
    setOpen(true);
  };

  const toggle = (): void => {
    if (!open || snapped) expand();
    else setOpen(false);
  };

  const close = (): void => setOpen(false);

  return { height, open, snapped, dragging, toggle, close, expand, onDrag };
}

interface PanelSlot {
  open: boolean;
  width: number;
}

function PanelSliver({
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
    <div className="agent-sliver" onMouseDown={onDrag} title={`Show panel — ${label}`}>
      <span className={`agent-dot ${busy ? "busy" : ""}`} />
      <button
        className="activity-btn"
        aria-label={`Show panel — ${label}`}
        onClick={onExpand}
      >
        <span className="codicon codicon-symbol-event" />
      </button>
    </div>
  );
}

function PanelColumn({
  session,
  slot,
  maxW,
  isLast,
  onSlot,
  onFocus,
  onClose
}: {
  session: SessionInfo;
  slot: PanelSlot;
  maxW: number;
  isLast: boolean;
  onSlot: (slot: PanelSlot) => void;
  onFocus: () => void;
  onClose: () => void;
}): ReactNode {
  const view = usePanel(session.workspace);
  const label = view.currentModel?.name ?? "Model";
  const expand = useCallback(() => {
    onFocus();
    onSlot({ open: true, width: Math.max(AGENT_DEFAULT_W, slot.width) });
  }, [onFocus, onSlot, slot.width]);
  const collapse = useCallback(() => onSlot({ ...slot, open: false }), [onSlot, slot]);
  const open = useCallback(() => onSlot({ ...slot, open: true }), [onSlot, slot]);
  const drag = useDragResize(
    slot.width,
    (width) => onSlot({ ...slot, width: typeof width === "function" ? width(slot.width) : width }),
    AGENT_MIN_W,
    maxW,
    true,
    slot.open,
    open,
    collapse
  );
  const rightDrag = useDragResize(
    slot.width,
    (width) => onSlot({ ...slot, width: typeof width === "function" ? width(slot.width) : width }),
    AGENT_MIN_W,
    maxW,
    false,
    slot.open,
    open,
    collapse
  );

  if (slot.open) {
    return (
      <>
        <div className="divider panel-divider-left" onMouseDown={drag} />
        <AgentPanel session={session} onCollapse={collapse} onFocus={onFocus} onClose={onClose} />
        <div className="divider panel-divider-right" onMouseDown={rightDrag} />
      </>
    );
  }
  return (
    <>
      <div className="divider collapsed panel-divider-left" onMouseDown={drag} />
      {isLast ? (
        <AgentTray busy={view.busy} label={label} onExpand={expand} onDrag={drag} />
      ) : (
        <PanelSliver busy={view.busy} label={label} onExpand={expand} onDrag={drag} />
      )}
      <div className="divider collapsed panel-divider-right" onMouseDown={rightDrag} />
    </>
  );
}

function Layout({ children }: { children?: ReactNode }): ReactNode {
  const { panels, focusSession, closePanel, selectFolder } = useStore();
  const [sideOpen, setSideOpen] = useState(true);
  const [sideW, setSideW] = useState(250);
  const [slots, setSlots] = useState<Record<string, PanelSlot>>({});
  const { height: trayH, open: trayOpen, snapped: traySnapped, dragging: trayDragging, toggle: toggleTray, close: closeTray, expand: expandTray, onDrag: trayDrag } = useTrayHeight();
  const [winW, setWinW] = useState(() => window.innerWidth);
  const [sessionsOpen, setSessionsOpen] = useState(false);

  useEffect(() => {
    const onResize = (): void => setWinW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setSlots((current) => {
      const next: Record<string, PanelSlot> = {};
      let changed = false;
      for (const panel of panels) {
        const id = panel.workspace.id;
        next[id] = current[id] ?? { open: true, width: AGENT_DEFAULT_W };
        if (!current[id]) changed = true;
      }
      if (Object.keys(current).length !== Object.keys(next).length) changed = true;
      return changed ? next : current;
    });
  }, [panels]);

  const panelShown = (id: string): number => {
    const slot = slots[id];
    return slot && slot.open ? slot.width : COLLAPSED_PANEL_W;
  };
  const sideShown = sideOpen ? sideW : COLLAPSED_PANEL_W;
  const fixedPanelChrome = 1 + panels.length * 2;

  const singlePanel = panels.length <= 1;
  const agentShown = singlePanel && panels.length === 1
    ? panelShown(panels[0].workspace.id)
    : 0;
  const sideMax = Math.max(SIDE_MIN_W, Math.min(SIDE_MAX_W, winW - agentShown - fixedPanelChrome));

  const sideCapRef = useRef<number | null>(null);
  const agentCapRef = useRef<number | null>(null);
  const agentOpen = singlePanel && panels.length === 1 && (slots[panels[0].workspace.id]?.open ?? true);

  useLayoutEffect(() => {
    if (singlePanel) {
      if (!sideOpen && !agentOpen) return;
       const avail = Math.max(0, winW - fixedPanelChrome);
      const agentLimit = Math.max(0, avail - sideShown);
      const sideLimit = Math.max(0, Math.min(SIDE_MAX_W, avail - agentShown));
      const agentAnchored = agentOpen && agentCapRef.current !== null && agentShown >= agentCapRef.current - 1;
      const sideAnchored = sideOpen && sideCapRef.current !== null && sideW >= sideCapRef.current - 1;
      if (agentOpen) agentCapRef.current = agentLimit;
      if (sideOpen) sideCapRef.current = sideLimit;
      const total = sideShown + agentShown;
      if (total <= avail) {
        if (agentAnchored && agentOpen && panels.length === 1) {
          setSlotWidth(panels[0].workspace.id, agentLimit);
        }
        if (sideAnchored) setSideW(sideLimit);
        return;
      }
      if (!sideOpen || !agentOpen) {
        if (agentOpen && panels.length === 1) {
          setSlotWidth(panels[0].workspace.id, agentLimit);
        } else setSideW(sideLimit);
        return;
      }
      if (agentAnchored !== sideAnchored) {
        if (agentAnchored && panels.length === 1) {
          setSlotWidth(panels[0].workspace.id, agentLimit);
        } else setSideW(sideLimit);
        return;
      }
      if (agentAnchored && panels.length === 1) {
        const nextAgent = Math.max(COLLAPSED_PANEL_W, agentLimit);
        setSlotWidth(panels[0].workspace.id, nextAgent);
        setSideW(Math.max(COLLAPSED_PANEL_W, Math.min(sideShown, avail - nextAgent)));
        return;
      }
      const nextSide = Math.max(COLLAPSED_PANEL_W, Math.round((sideShown * avail) / total));
      const nextAgent = Math.max(COLLAPSED_PANEL_W, avail - nextSide);
      setSideW(nextSide);
      if (panels.length === 1) {
        setSlotWidth(panels[0].workspace.id, nextAgent);
      }
      return;
    }
     const avail = Math.max(0, winW - fixedPanelChrome - sideShown);
    const openIDs = panels
      .filter((panel) => slots[panel.workspace.id]?.open)
      .map((panel) => panel.workspace.id);
    if (openIDs.length === 0) return;
    const totalShown = panels.reduce((sum, panel) => sum + panelShown(panel.workspace.id), 0);
    if (totalShown <= avail) return;
    const base = Math.max(COLLAPSED_PANEL_W, Math.floor(avail / openIDs.length));
    for (const id of openIDs) setSlotWidth(id, Math.min(slots[id]?.width ?? base, base));
  }, [winW, sideOpen, sideW, panels, slots, singlePanel, sideShown, agentShown, agentOpen]);

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

  const cols = [
    sideOpen ? `${sideW}px` : `${COLLAPSED_PANEL_W}px`,
    "1px",
    "minmax(0,1fr)",
    ...panels.flatMap((panel) => ["1px", `${panelShown(panel.workspace.id)}px`, "1px"])
  ].join(" ");

  const prevSidebarRef = useRef<{ open: boolean; width: number } | null>(null);
  const agentCap = Math.max(0, winW - sideShown - 2);
  const inAgentMode = prevSidebarRef.current !== null;

  useEffect(() => {
    if (prevSidebarRef.current === null) return;
    const stillInMode = !sideOpen && agentOpen && panels.length === 1 && Math.abs(panelShown(panels[0].workspace.id) - agentCap) < 2;
    if (!stillInMode) prevSidebarRef.current = null;
  }, [sideOpen, agentOpen, slots, agentCap, panels]);

  const setSidebarOpen = (open: boolean): void => {
    if (open) setSideW(SIDE_DEFAULT_W);
    setSideOpen(open);
  };

  const toggleAgentMode = (): void => {
    const lastPanel = panels[panels.length - 1];
    if (!lastPanel) return;
    if (prevSidebarRef.current === null) {
      prevSidebarRef.current = { open: sideOpen, width: sideW };
      setSideOpen(false);
      setSlots((current) => ({
        ...current,
        [lastPanel.workspace.id]: { open: true, width: Math.max(0, winW - COLLAPSED_PANEL_W - 2) }
      }));
    } else {
      const prev = prevSidebarRef.current;
      prevSidebarRef.current = null;
      setSideOpen(prev.open);
      setSideW(prev.width);
      setSlots((current) => ({
        ...current,
        [lastPanel.workspace.id]: { open: true, width: AGENT_MIN_W }
      }));
    }
  };

  const panelMax = (id: string): number => {
    const others = panels
      .filter((panel) => panel.workspace.id !== id)
      .reduce((sum, panel) => sum + panelShown(panel.workspace.id), 0);
    return Math.max(AGENT_MIN_W, winW - sideShown - others - fixedPanelChrome);
  };

  const slotFor = (panel: SessionInfo): PanelSlot => slots[panel.workspace.id] ?? { open: true, width: AGENT_DEFAULT_W };

  const setSlotWidth = (id: string, width: number): void => {
    setSlots((current) => {
      const slot = current[id] ?? { open: true, width: AGENT_DEFAULT_W };
      if (slot.width === width) return current;
      return { ...current, [id]: { ...slot, width } };
    });
  };

  return (
    <div className="app">
      <div className="titlebar">
        <span className="titlebar-title">OpenShell</span>
        <span className="titlebar-actions">
          <button
            className={`icon-btn ${sessionsOpen ? "on" : ""}`}
            title="Sessions — running sessions, recents, and saved workspaces"
            onClick={() => setSessionsOpen((open) => !open)}
          >
            <span className="codicon codicon-history" />
          </button>
          <button
            className="icon-btn"
            title="Open another workspace"
            onClick={() => void selectFolder()}
          >
            <span className="codicon codicon-folder-opened" />
          </button>
          <button
            className="icon-btn"
            title="Open another workspace as a new session panel"
            onClick={() => void selectFolder()}
          >
            <span className="codicon codicon-add" />
          </button>
          <button
            className={`icon-btn ${inAgentMode ? "on" : ""}`}
            title={inAgentMode
              ? "Exit agent mode — restore the file panel and shrink the agent to its minimum width"
              : "Agent mode — collapse the sidebar and expand the agent panel to a single chat view"}
            onClick={toggleAgentMode}
          >
            <span className="codicon codicon-robot" />
          </button>
          <button
            className={`icon-btn ${trayOpen ? "on" : ""}`}
            title={trayOpen
              ? (traySnapped ? "Expand terminal (⌥O)" : "Hide terminal (⌥O)")
              : "Show terminal (⌥O)"}
            onClick={toggleTray}
          >
            ▤
          </button>
        </span>
      </div>

      <div className="main-row" style={{ "--pane-columns": cols } as CSSProperties}>
        <FileSidebar collapsed={!sideOpen} onCollapse={setSidebarOpen} onDrag={sideDrag} />
        <div className={`divider ${sideOpen ? "" : "collapsed"}`} onMouseDown={sideDrag} />
        <EditorPane />
        {panels.map((panel, index) => (
          <PanelColumn
            key={panel.workspace.id}
            session={panel}
            slot={slotFor(panel)}
            maxW={panelMax(panel.workspace.id)}
            isLast={index === panels.length - 1}
            onSlot={(slot) => setSlots((current) => ({ ...current, [panel.workspace.id]: slot }))}
            onFocus={() => focusSession(panel.id)}
            onClose={() => closePanel(panel.id)}
          />
        ))}
      </div>

      <div
        className={`tray-area ${trayOpen ? "open" : ""} ${trayDragging ? "dragging" : ""}`}
        style={{ "--tray-height": `${trayH}px` } as CSSProperties}
      >
        <div className="tray-inner">
          <div className="tray-divider" onMouseDown={trayDrag} title="Drag to resize" />
          <TerminalTray height={trayH} snapped={traySnapped} onClose={closeTray} onExpand={expandTray} />
        </div>
      </div>

      <SessionsTab open={sessionsOpen} onClose={() => setSessionsOpen(false)} />
      <Toasts />
      <RecoveryNotice />
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
