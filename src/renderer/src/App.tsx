import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { StoreProvider, usePanel, useStore } from "./store";
import { IconAdd, IconFile, IconFolderOpen, IconHistory, IconRobot, IconSymbolEvent, IconTerminal } from "./components/icons";
import type { SessionInfo } from "@shared/types";
import { Welcome } from "./components/Welcome";
import { FileSidebar, type SidebarTab } from "./components/FileSidebar";
import { EditorPane } from "./components/EditorPane";
import { AgentPanel } from "./components/AgentPanel";
import { AgentTray } from "./components/AgentTray";
import { TerminalTray } from "./components/TerminalTray";
import { RecoveryNotice } from "./components/RecoveryNotice";
import { StatusBar } from "./components/StatusBar";
import { OmniMark } from "./components/OmniMark";
import { SettingsPage } from "./components/SettingsPage";
import { SettingsSidebar, type SettingsSection } from "./components/SettingsSidebar";
import { ThemeProvider } from "./theme";

const COLLAPSED_PANEL_W = 44;
const SIDE_MIN_W = 280;
const SIDE_MAX_W = 520;
const SIDE_DEFAULT_W = 280;
const AGENT_DEFAULT_W = 280;
const AGENT_MIN_W = 280;

function useDragResize(
  width: number,
  setWidth: React.Dispatch<React.SetStateAction<number>>,
  min: number,
  max: number,
  flip: boolean,
  open: boolean,
  onOpen: () => void,
  onCollapse?: () => void,
  left?: number,
  setLeft?: (value: number) => void,
  onSnap?: () => void
): (e: React.MouseEvent) => void {
  const startRef = useRef<{ x: number; width: number; open: boolean; left: number; live: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault();
    const startedOpen = open;
    startRef.current = {
      x: e.clientX,
      width: startedOpen ? width : COLLAPSED_PANEL_W,
      open: startedOpen,
      left: left ?? 0,
      live: startedOpen ? width : COLLAPSED_PANEL_W
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
        const nextW = onCollapse ? (startedOpen ? Math.max(min, rawW) : rawW) : Math.max(min, rawW);
        const capped = Math.min(max, nextW);
        startRef.current.live = capped;
        setWidth(capped);
        if (flip && setLeft) {
          setLeft(startRef.current.left + startRef.current.width - capped);
        }
        if (!startRef.current.open) {
          startRef.current.open = true;
          onOpen();
        }
      }
    };
    const up = (): void => {
      const start = startRef.current;
      if (start && start.open && onCollapse) {
        if (start.live <= COLLAPSED_PANEL_W) {
          onCollapse();
        } else if (start.live < min) {
          if (flip && setLeft) setLeft(start.left + start.width - min);
          setWidth(min);
          onSnap?.();
        }
      }
      startRef.current = null;
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
  left: number;
  leftAnchored?: boolean;
  top: number;
  height: number;
}

function PanelSliver({
  busy,
  label,
  onExpand,
  onLeftDrag,
  onRightDrag
}: {
  busy: boolean;
  label: string;
  onExpand: () => void;
  onLeftDrag: (e: React.MouseEvent) => void;
  onRightDrag?: (e: React.MouseEvent) => void;
}): ReactNode {
  return (
    <div className="agent-sliver" title={`Show panel — ${label}`}>
      <div className="panel-resize-handle panel-resize-left" onMouseDown={onLeftDrag} />
      <span className={`agent-dot ${busy ? "busy" : ""}`} />
      <button
        className="activity-btn"
        aria-label={`Show panel — ${label}`}
        onClick={onExpand}
      >
        <IconSymbolEvent />
      </button>
      {onRightDrag && <div className="panel-resize-handle panel-resize-right" onMouseDown={onRightDrag} />}
    </div>
  );
}

function PanelColumn({
  session,
  slot,
  isAnchor,
  freeMove,
  leftMin,
  leftMax,
  rightMax,
  isLast,
  onSlot,
  onFocus,
  onClose
}: {
  session: SessionInfo;
  slot: PanelSlot;
  isAnchor: boolean;
  freeMove: boolean;
  leftMin: number;
  leftMax: number;
  rightMax: number;
  isLast: boolean;
  onSlot: React.Dispatch<React.SetStateAction<PanelSlot>>;
  onFocus: () => void;
  onClose: () => void;
}): ReactNode {
  const view = usePanel(session.workspace);
  const label = view.currentModel?.name ?? "Model";
  const [settling, setSettling] = useState(false);
  const settleTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
  }, []);
  const settle = useCallback(() => {
    setSettling(true);
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      setSettling(false);
    }, 200);
  }, []);
  const expand = useCallback(() => {
    onFocus();
    onSlot((current) => ({ ...current, open: true, width: Math.max(AGENT_DEFAULT_W, current.width) }));
  }, [onFocus, onSlot]);
  const collapse = useCallback(() => onSlot((current) => ({ ...current, open: false })), [onSlot]);
  const open = useCallback(() => onSlot((current) => ({ ...current, open: true })), [onSlot]);
  const resizeRight = useDragResize(
    slot.width,
    (width) => onSlot((current) => ({ ...current, width: typeof width === "function" ? width(current.width) : width })),
    AGENT_MIN_W,
    rightMax,
    false,
    slot.open,
    open,
    collapse,
    slot.left,
    undefined,
    settle
  );
  const resizeLeft = useDragResize(
    slot.width,
    (width) => onSlot((current) => ({ ...current, width: typeof width === "function" ? width(current.width) : width })),
    AGENT_MIN_W,
    slot.left + slot.width - leftMin,
    true,
    slot.open,
    open,
    collapse,
    slot.left,
    (left) => onSlot((current) => ({ ...current, left, leftAnchored: true })),
    settle
  );
  const slideBy = (delta: number): void => {
    onSlot((current) => ({ ...current, left: Math.min(leftMax, Math.max(leftMin, current.left + delta)) }));
  };

  if (slot.open) {
    return (
      <div className={`agent-col ${settling ? "settling" : ""}`} style={{ left: `${slot.left}px`, top: `${slot.top}%`, bottom: "auto", width: `${slot.width}px`, height: `${slot.height}%` }}>
        <AgentPanel session={session} isAnchor={isAnchor} onCollapse={collapse} onFocus={onFocus} onClose={onClose} onResizeLeft={freeMove ? undefined : resizeLeft} onResizeRight={freeMove ? undefined : isAnchor ? undefined : resizeRight} onPanelDrag={freeMove ? undefined : isAnchor ? undefined : slideBy} />
      </div>
    );
  }
  return (
    <div className={`agent-col ${settling ? "settling" : ""}`} style={{ left: `${slot.left}px`, top: `${slot.top}%`, bottom: "auto", width: `${COLLAPSED_PANEL_W}px`, height: `${slot.height}%` }}>
      {isLast ? (
        <AgentTray busy={view.busy} label={label} onExpand={expand} onResizeLeft={resizeLeft} onResizeRight={isAnchor && !freeMove ? undefined : resizeRight} />
      ) : (
        <PanelSliver busy={view.busy} label={label} onExpand={expand} onLeftDrag={resizeLeft} onRightDrag={isAnchor && !freeMove ? undefined : resizeRight} />
      )}
    </div>
  );
}

function Layout({ children }: { children?: ReactNode }): ReactNode {
  const { panels: allPanels, workspaceOnlyPanelIDs, activeSessionID, focusSession, closePanel, selectAddPanel, selectFolder, selectFile } = useStore();
  const panels = useMemo(() => {
    const agentPanels = allPanels.filter((panel) => !workspaceOnlyPanelIDs.has(panel.id));
    const active = allPanels.find((panel) => panel.id === activeSessionID);
    if (!active || !workspaceOnlyPanelIDs.has(active.id)) return agentPanels;
    return [active, ...agentPanels.slice(1)];
  }, [allPanels, workspaceOnlyPanelIDs, activeSessionID]);
  const [sideOpen, setSideOpen] = useState(true);
  const [sideW, setSideW] = useState(SIDE_DEFAULT_W);
  const [slots, setSlots] = useState<Record<string, PanelSlot>>({});
  const [pendingModelPanels, setPendingModelPanels] = useState(0);
  const { height: trayH, open: trayOpen, snapped: traySnapped, dragging: trayDragging, toggle: toggleTray, close: closeTray, expand: expandTray, onDrag: trayDrag } = useTrayHeight();
  const [winW, setWinW] = useState(() => window.innerWidth);
  const [sideTab, setSideTab] = useState<SidebarTab>("sessions");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
  const prevSidebarRef = useRef<{ open: boolean; width: number } | null>(null);
  const inAgentMode = prevSidebarRef.current !== null;

  const sideShown = sideOpen ? sideW : COLLAPSED_PANEL_W;
  const fixedPanelChrome = 1 + panels.length;
  const areaW = Math.max(0, winW - sideShown - 1);

  useEffect(() => {
    const onResize = (): void => setWinW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const prevPanelsRef = useRef<SessionInfo[] | null>(null);
  useEffect(() => {
    const prev = prevPanelsRef.current;
    prevPanelsRef.current = panels;
    if (!prev || prev.length !== panels.length) return;
    for (let index = 0; index < panels.length; index += 1) {
      const before = prev[index];
      const after = panels[index];
      if (before.id === after.id) continue;
      setSlots((current) => {
        const migrated = current[before.workspace.id];
        if (!migrated || current[after.workspace.id] === migrated) return current;
        const next = { ...current, [after.workspace.id]: migrated };
        delete next[before.workspace.id];
        return next;
      });
    }
  }, [panels]);

  useEffect(() => {
    setSlots((current) => {
      const anchorId = panels[0]?.workspace.id ?? null;
      const anchorStored = anchorId ? current[anchorId] : undefined;
      const anchorWidth = anchorStored ? (anchorStored.open ? anchorStored.width : COLLAPSED_PANEL_W) : AGENT_DEFAULT_W;
      const anchorLeft = Math.max(0, areaW - anchorWidth);
      const next: Record<string, PanelSlot> = {};
      let changed = false;
      for (const panel of panels) {
        const id = panel.workspace.id;
        const existing = current[id];
        if (existing) {
          next[id] = existing;
          continue;
        }
        if (id === anchorId) {
          next[id] = { open: true, width: AGENT_DEFAULT_W, left: anchorLeft, top: 0, height: 100 };
          changed = true;
          continue;
        }
        let left = anchorLeft - AGENT_DEFAULT_W;
        for (const other of panels) {
          if (other.workspace.id === id || other.workspace.id === anchorId) continue;
          const s = next[other.workspace.id] ?? current[other.workspace.id];
          if (!s) continue;
          left = Math.min(left, s.left - AGENT_DEFAULT_W);
        }
        next[id] = { open: true, width: AGENT_DEFAULT_W, left: Math.max(0, left), top: 0, height: 100 };
        changed = true;
      }
      if (Object.keys(current).length !== Object.keys(next).length) changed = true;
      return changed ? next : current;
    });
  }, [panels, areaW]);

  const slotShown = (panel: SessionInfo): number => {
    const slot = slots[panel.workspace.id] ?? { open: true, width: AGENT_DEFAULT_W, left: 0, top: 0, height: 100 };
    return slot.open ? slot.width : COLLAPSED_PANEL_W;
  };
  const slotFor = (panel: SessionInfo): PanelSlot => {
    const anchorId = panels[0]?.workspace.id ?? null;
    const stored = slots[panel.workspace.id];
    if (inAgentMode && panels.length === 1) {
      return {
        open: true,
        width: Math.max(COLLAPSED_PANEL_W, winW - COLLAPSED_PANEL_W - fixedPanelChrome),
        left: 0,
        top: 0,
        height: 100
      };
    }
    if (panel.workspace.id === anchorId) {
      const open = stored?.open ?? true;
      const width = stored ? (open ? stored.width : COLLAPSED_PANEL_W) : AGENT_DEFAULT_W;
      if (inAgentMode && stored) {
        return {
          open: true,
          width: Math.max(AGENT_DEFAULT_W, stored.width),
          left: stored.left,
          top: stored.top,
          height: stored.height
        };
      }
      if (open && stored?.left === 0 && stored.leftAnchored) {
        return { open: true, width: areaW, left: 0, top: 0, height: 100 };
      }
      return { open, width, left: Math.max(0, areaW - width), top: 0, height: 100 };
    }
    if (stored) {
      return inAgentMode && !stored.open
        ? { ...stored, open: true, width: Math.max(AGENT_DEFAULT_W, stored.width) }
        : stored;
    }
    const anchorStored = anchorId ? slots[anchorId] : undefined;
    const anchorWidth = anchorStored ? (anchorStored.open ? anchorStored.width : COLLAPSED_PANEL_W) : AGENT_DEFAULT_W;
    const anchorLeft = Math.max(0, areaW - anchorWidth);
    let left = anchorLeft - AGENT_DEFAULT_W;
    for (const other of panels) {
      if (other.workspace.id === panel.workspace.id || other.workspace.id === anchorId) continue;
      const s = slots[other.workspace.id];
      if (!s) continue;
      left = Math.min(left, s.left - AGENT_DEFAULT_W);
    }
    return { open: true, width: AGENT_DEFAULT_W, left: Math.max(0, left), top: 0, height: 100 };
  };

  const ordered = [...panels].sort((a, b) => slotFor(a).left - slotFor(b).left);

  const singlePanel = panels.length <= 1;
  const agentShown = singlePanel && panels.length === 1
    ? slotShown(panels[0])
    : 0;
  const sideMax = Math.max(SIDE_MIN_W, Math.min(SIDE_MAX_W, winW - agentShown - fixedPanelChrome));

  const sideCapRef = useRef<number | null>(null);
  const agentCapRef = useRef<number | null>(null);

  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  useLayoutEffect(() => {
    const current = slotsRef.current;
    const shown = (panel: SessionInfo): number => {
      const slot = current[panel.workspace.id] ?? { open: true, width: AGENT_DEFAULT_W, left: 0, top: 0, height: 100 };
      return slot.open ? slot.width : COLLAPSED_PANEL_W;
    };
    if (prevSidebarRef.current !== null) {
      const avail = Math.max(0, winW - fixedPanelChrome - sideShown);
      const openIDs = panels
        .filter((panel) => current[panel.workspace.id]?.open ?? true)
        .map((panel) => panel.workspace.id);
      if (openIDs.length === 0) return;
      const gridIDs = [...panels].reverse()
        .map((panel) => panel.workspace.id)
        .filter((id) => openIDs.includes(id));
      const columns = gridIDs.length === 1 ? 1 : 2;
      const rows = gridIDs.length >= 3 ? 2 : 1;
      const base = Math.max(COLLAPSED_PANEL_W, Math.floor(avail / columns));
      setSlots((slots) => {
        const next = { ...slots };
        gridIDs.forEach((id, index) => {
          const column = index % columns;
          const row = Math.floor(index / columns);
          next[id] = {
            ...(next[id] ?? { open: true, width: base, left: 0, top: 0, height: 100 }),
            open: true,
            width: column === columns - 1 ? Math.max(COLLAPSED_PANEL_W, avail - base) : base,
            left: column === 0 ? 0 : base,
            top: row * (100 / rows),
            height: 100 / rows
          };
        });
        return next;
      });
      return;
    }
    if (panels.length <= 1) {
      if (panels.length === 0) return;
      const panel0 = panels[0];
      const panelOpen = current[panel0.workspace.id]?.open ?? true;
      if (!sideOpen && !panelOpen) return;
      const avail = Math.max(0, winW - fixedPanelChrome);
      const agentShownNow = panelOpen ? shown(panel0) : 0;
      const agentLimit = Math.max(0, avail - sideShown);
      const sideLimit = Math.max(0, Math.min(SIDE_MAX_W, avail - agentShownNow));
      const agentAnchored = panelOpen && agentCapRef.current !== null && agentShownNow >= agentCapRef.current - 1;
      const sideAnchored = sideOpen && sideCapRef.current !== null && sideW >= sideCapRef.current - 1;
      if (panelOpen) agentCapRef.current = agentLimit;
      if (sideOpen) sideCapRef.current = sideLimit;
      const total = sideShown + agentShownNow;
      if (total <= avail) return;
      if (!sideOpen || !panelOpen) {
        if (panelOpen) setSlotWidth(panel0.workspace.id, agentLimit);
        else setSideW(sideLimit);
        return;
      }
      if (agentAnchored !== sideAnchored) {
        if (agentAnchored) setSlotWidth(panel0.workspace.id, agentLimit);
        else setSideW(sideLimit);
        return;
      }
      if (agentAnchored) {
        const nextAgent = Math.max(COLLAPSED_PANEL_W, agentLimit);
        setSlotWidth(panel0.workspace.id, nextAgent);
        setSideW(Math.max(COLLAPSED_PANEL_W, Math.min(sideShown, avail - nextAgent)));
        return;
      }
      const nextSide = Math.max(COLLAPSED_PANEL_W, Math.round((sideShown * avail) / total));
      const nextAgent = Math.max(COLLAPSED_PANEL_W, avail - nextSide);
      setSideW(nextSide);
      setSlotWidth(panel0.workspace.id, nextAgent);
      return;
    }
    const avail = Math.max(0, winW - fixedPanelChrome - sideShown);
    const openIDs = panels
      .filter((panel) => current[panel.workspace.id]?.open)
      .map((panel) => panel.workspace.id);
    if (openIDs.length === 0) return;
    const totalShown = panels.reduce((sum, panel) => sum + shown(panel), 0);
    if (totalShown > avail) {
      const base = Math.max(COLLAPSED_PANEL_W, Math.floor(avail / openIDs.length));
      for (const id of openIDs) setSlotWidth(id, Math.min(current[id]?.width ?? base, base));
    }
    const anchorId = panels[0]?.workspace.id ?? null;
    const anchorStored = anchorId ? current[anchorId] : undefined;
    const anchorShown = anchorStored ? (anchorStored.open ? anchorStored.width : COLLAPSED_PANEL_W) : AGENT_DEFAULT_W;
    const anchorLeft = Math.max(0, areaW - anchorShown);
    const others = panels
      .filter((panel) => panel.workspace.id !== anchorId)
      .sort((a, b) => (current[b.workspace.id]?.left ?? 0) - (current[a.workspace.id]?.left ?? 0));
    let boundary = anchorLeft;
    for (const panel of others) {
      const slot = current[panel.workspace.id];
      if (!slot) continue;
      const w = slot.open ? slot.width : COLLAPSED_PANEL_W;
      const capped = Math.max(0, Math.min(slot.left, boundary - w));
      if (capped !== slot.left) setSlotLeft(panel.workspace.id, capped);
      boundary = Math.min(boundary, capped);
    }
  }, [winW, sideOpen, sideW, panels]);

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
    "minmax(0,1fr)"
  ].join(" ");

  const setSidebarOpen = (open: boolean): void => {
    if (open) setSideW(SIDE_DEFAULT_W);
    setSideOpen(open);
  };

  const distributeEvenly = useCallback((sideShownAt: number, singleRestore: boolean): void => {
    setSlots((current) => {
      const anchorId = panels[0]?.workspace.id ?? null;
      const modelMode = prevSidebarRef.current !== null;
      const openIDs = modelMode
        ? panels.map((panel) => panel.workspace.id)
        : panels
          .filter((panel) => panel.workspace.id === anchorId || (current[panel.workspace.id]?.open ?? true))
          .map((panel) => panel.workspace.id);
      if (openIDs.length === 0) return current;
      if (singleRestore && openIDs.length === 1 && anchorId) {
        return { ...current, [anchorId]: { open: true, width: AGENT_DEFAULT_W, left: 0, top: 0, height: 100 } };
      }
      const area = Math.max(0, winW - sideShownAt - 1);
      const total = Math.max(0, winW - fixedPanelChrome - sideShownAt);
      const grid = modelMode && openIDs.length >= 3;
      const columns = grid ? 2 : openIDs.length;
      const rows = grid ? 2 : 1;
      const width = Math.max(COLLAPSED_PANEL_W, Math.floor(total / columns));
      const anchorW = Math.max(COLLAPSED_PANEL_W, total - width * (columns - 1));
      const next: Record<string, PanelSlot> = {};
      let boundary = Math.max(0, area - anchorW);
      for (const [index, panel] of [...panels].reverse().entries()) {
        const id = panel.workspace.id;
        if (id === anchorId || !openIDs.includes(id)) continue;
        boundary -= width;
        next[id] = {
          open: true,
          width,
          left: grid ? (index % columns) * Math.floor(total / columns) : Math.max(0, boundary),
          leftAnchored: false,
          top: grid ? Math.floor(index / columns) * (100 / rows) : 0,
          height: grid ? 100 / rows : 100
        };
      }
      if (anchorId) {
        const anchorIndex = openIDs.length - 1;
        next[anchorId] = {
          open: true,
          width: anchorW,
          left: grid ? (anchorIndex % columns) * Math.floor(total / columns) : Math.max(0, area - anchorW),
          leftAnchored: false,
          top: grid ? Math.floor(anchorIndex / columns) * (100 / rows) : 0,
          height: grid ? 100 / rows : 100
        };
      }
      return { ...current, ...next };
    });
  }, [fixedPanelChrome, panels, winW]);

  const previousPanelCountRef = useRef(panels.length);
  useEffect(() => {
    if (inAgentMode && panels.length > previousPanelCountRef.current) {
      distributeEvenly(COLLAPSED_PANEL_W, false);
    }
    previousPanelCountRef.current = panels.length;
  }, [distributeEvenly, inAgentMode, panels.length]);

  const addModelPanel = (): void => {
    if (!inAgentMode || panels.length + pendingModelPanels >= 4) return;
    setPendingModelPanels((count) => count + 1);
    void selectAddPanel().finally(() => setPendingModelPanels((count) => Math.max(0, count - 1)));
  };

  const toggleAgentMode = (): void => {
    const anchor = panels[0];
    if (!anchor) return;
    if (prevSidebarRef.current === null) {
      prevSidebarRef.current = { open: sideOpen, width: sideW };
      setSideOpen(false);
      distributeEvenly(COLLAPSED_PANEL_W, false);
    } else {
      const prev = prevSidebarRef.current;
      prevSidebarRef.current = null;
      setSideOpen(prev.open);
      setSideW(prev.width);
      distributeEvenly(prev.open ? prev.width : COLLAPSED_PANEL_W, true);
    }
  };

  const setSlotWidth = (id: string, width: number): void => {
    setSlots((current) => {
      const slot = current[id] ?? { open: true, width: AGENT_DEFAULT_W, left: 0, top: 0, height: 100 };
      if (slot.width === width) return current;
      return { ...current, [id]: { ...slot, width } };
    });
  };

  const setSlotLeft = (id: string, left: number): void => {
    setSlots((current) => {
      const slot = current[id] ?? { open: true, width: AGENT_DEFAULT_W, left, top: 0, height: 100 };
      if (slot.left === left) return current;
      return { ...current, [id]: { ...slot, left } };
    });
  };

  return (
    <div className="app">
      <div className="titlebar">
        <span className="titlebar-title"><OmniMark size={16} />OmniAgent</span>
        <span className="titlebar-actions">
          <button
            className={`icon-btn ${sideOpen && sideTab === "sessions" ? "on" : ""}`}
            title="Sessions — pinned sessions, projects, and recents"
            onClick={() => {
              setSettingsOpen(false);
              setSideTab("sessions");
              if (!sideOpen) setSidebarOpen(true);
            }}
          >
            <IconHistory />
          </button>
          <button
            className="icon-btn"
            title="Open another workspace"
            onClick={() => void selectFolder()}
          >
            <IconFolderOpen />
          </button>
          <button
            className="icon-btn"
            title="Open a single file"
            onClick={() => void selectFile()}
          >
            <IconFile />
          </button>
          {inAgentMode && (
            <button
              className="icon-btn"
              data-panel-action="add-model-panel"
              title={panels.length + pendingModelPanels >= 4 ? "Model panel limit reached (4)" : "Add model panel (choose a folder for the new panel)"}
              aria-label="Add model panel"
              disabled={panels.length + pendingModelPanels >= 4}
              onClick={addModelPanel}
            >
              <IconAdd />
            </button>
          )}
          <button
            className={`icon-btn ${inAgentMode ? "on" : ""}`}
            data-panel-action="toggle-model-mode"
            aria-label={inAgentMode ? "Exit Agent Mode" : "Enter Agent Mode"}
            aria-pressed={inAgentMode}
            title={inAgentMode
              ? "Exit Agent Mode — restore the file tray"
              : "Agent Mode — collapse the file tray and split models across the app"}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleAgentMode();
            }}
          >
            <IconRobot />
          </button>
          <button
            className={`icon-btn ${trayOpen ? "on" : ""}`}
            title={trayOpen
              ? (traySnapped ? "Expand terminal (⌥O)" : "Hide terminal (⌥O)")
              : "Show terminal (⌥O)"}
            onClick={toggleTray}
          >
            <IconTerminal />
          </button>
        </span>
      </div>

      <div className="main-row" style={{ "--pane-columns": cols } as CSSProperties}>
        {settingsOpen ? <SettingsSidebar
          section={settingsSection}
          onSectionChange={setSettingsSection}
          onClose={() => setSettingsOpen(false)}
        /> : <FileSidebar
          collapsed={!sideOpen}
          onCollapse={setSidebarOpen}
          onDrag={sideDrag}
          tab={sideTab}
          onTabChange={(tab) => {
            setSideTab(tab);
            setSettingsOpen(false);
          }}
          onOpenSettings={() => {
            setSidebarOpen(true);
            setSettingsOpen(true);
          }}
          settingsOpen={settingsOpen}
        />}
        <div className={`divider ${sideOpen ? "" : "collapsed"}`} onMouseDown={sideDrag} />
        {settingsOpen ? <SettingsPage section={settingsSection} onClose={() => setSettingsOpen(false)} /> : <div
          className="workspace-area"
          style={
            {
              "--editor-right": `${inAgentMode || (ordered.length > 0 && slotFor(ordered[0]).left === 0) ? 0 : Math.max(0, areaW - (ordered.length > 0 ? slotFor(ordered[0]).left : areaW))}px`
            } as CSSProperties
          }
        >
          <EditorPane />
          {ordered.map((panel, index) => {
            const s = slotFor(panel);
            const anchorId = panels[0]?.workspace.id ?? null;
            const isAnchor = panel.workspace.id === anchorId;
            const leftN = index > 0 ? ordered[index - 1] : null;
            const rightN = index < ordered.length - 1 ? ordered[index + 1] : null;
            const leftMin = Math.max(0, leftN ? slotFor(leftN).left + slotShown(leftN) : 0);
            const leftMax = rightN ? slotFor(rightN).left - slotShown(panel) : areaW - slotShown(panel);
            const rightMax = (rightN ? slotFor(rightN).left : areaW) - s.left;
            return (
              <PanelColumn
                key={panel.workspace.id}
                session={panel}
                slot={s}
                isAnchor={isAnchor}
                freeMove={inAgentMode}
                leftMin={leftMin}
                leftMax={leftMax}
                rightMax={rightMax}
                isLast={index === ordered.length - 1}
                onSlot={(update) =>
                  setSlots((current) => {
                    const base = current[panel.workspace.id] ?? { open: true, width: AGENT_DEFAULT_W, left: 0, top: 0, height: 100 };
                    return { ...current, [panel.workspace.id]: typeof update === "function" ? update(base) : update };
                  })
                }
                onFocus={() => focusSession(panel.id)}
                onClose={() => closePanel(panel.id)}
              />
            );
          })}
        </div>}
      </div>

      {!settingsOpen && <div
        className={`tray-area ${trayOpen ? "open" : ""} ${trayDragging ? "dragging" : ""}`}
        style={{ "--tray-height": `${trayH}px` } as CSSProperties}
      >
        <div className="tray-inner">
          <div className="tray-divider" onMouseDown={trayDrag} title="Drag to resize" />
          <TerminalTray height={trayH} snapped={traySnapped} onClose={closeTray} onExpand={expandTray} />
        </div>
      </div>}

      {!settingsOpen && <StatusBar />}
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
    <ThemeProvider>
      <StoreProvider>
        <Root />
      </StoreProvider>
    </ThemeProvider>
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
