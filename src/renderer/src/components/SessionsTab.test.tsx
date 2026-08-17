import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionInfo, SessionSummary } from "@shared/types";

const state = vi.hoisted(() => ({
  panels: [] as SessionInfo[],
  panelViews: {} as Record<string, { busy: boolean }>,
  activeSessionID: null as string | null,
  sessions: [] as SessionSummary[],
  focusSession: vi.fn(),
  closePanel: vi.fn(),
  reopenSession: vi.fn(),
  openSession: vi.fn(),
  selectFolder: vi.fn(),
  loadSessions: vi.fn(async () => {})
}));

vi.mock("../store", () => ({
  useStore: () => ({
    panels: state.panels,
    panelViews: state.panelViews,
    activeSessionID: state.activeSessionID,
    focusSession: state.focusSession,
    closePanel: state.closePanel,
    reopenSession: state.reopenSession,
    openSession: state.openSession,
    selectFolder: state.selectFolder,
    sessions: state.sessions,
    loadSessions: state.loadSessions
  })
}));

import { SessionsTab } from "./SessionsTab";

function session(id: string, directory: string, title?: string): SessionInfo {
  return {
    id,
    directory,
    ...(title ? { title } : {}),
    workspace: { id: `00000000-0000-4000-8000-${id.padEnd(12, "0")}`, generation: 1 }
  };
}

describe("SessionsTab rail", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.panels = [];
    state.panelViews = {};
    state.activeSessionID = null;
    state.sessions = [];
    for (const mock of [state.focusSession, state.closePanel, state.reopenSession, state.openSession, state.selectFolder, state.loadSessions]) {
      mock.mockClear();
    }
    window.openshell = {
      projects: vi.fn(async () => [
        { directory: "/saved/a", name: "Saved A" },
        { directory: "/saved/b", name: "Saved B" }
      ])
    } as unknown as typeof window.openshell;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("hides entirely when closed", async () => {
    await act(async () => root.render(<SessionsTab open={false} onClose={() => {}} />));
    expect(container.innerHTML).toBe("");
  });

  it("lists running sessions, focuses them, and closes panels", async () => {
    state.panels = [session("one", "/repo/one", "One"), session("two", "/repo/two")];
    state.panelViews = { [state.panels[0].workspace.id]: { busy: true }, [state.panels[1].workspace.id]: { busy: false } };
    state.activeSessionID = "two";
    await act(async () => root.render(<SessionsTab open onClose={() => {}} />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    const running = container.querySelector(".sessions-section");
    expect(running?.textContent).toContain("Running");
    const rows = running!.querySelectorAll(".sessions-row");
    expect(rows).toHaveLength(2);
    expect(rows[1].classList.contains("focused")).toBe(true);
    expect(rows[0].querySelector(".agent-dot")?.classList.contains("busy")).toBe(true);
    expect(rows[1].querySelector(".agent-dot")?.classList.contains("live")).toBe(true);
    expect(rows[0].querySelector(".agent-dot")?.classList.contains("live")).toBe(true);

    await act(async () => (rows[0] as HTMLButtonElement).click());
    expect(state.focusSession).toHaveBeenCalledWith("one");

    await act(async () => {
      (rows[0].querySelector(".sessions-row-close") as HTMLButtonElement).click();
    });
    expect(state.closePanel).toHaveBeenCalledWith("one");
  });

  it("focuses a running recent session instead of reopening it", async () => {
    state.panels = [session("one", "/repo/one", "One")];
    state.sessions = [{ id: "one", title: "One", directory: "/repo/one", updatedAt: 1 }];
    await act(async () => root.render(<SessionsTab open onClose={() => {}} />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    const recent = [...container.querySelectorAll(".sessions-row")].find((row) => row.textContent?.includes("One"));
    expect(recent).toBeTruthy();
    await act(async () => (recent as HTMLDivElement).click());

    expect(state.focusSession).toHaveBeenCalledWith("one");
    expect(state.reopenSession).not.toHaveBeenCalled();
  });

  it("lists recent sessions and reopens them on click", async () => {
    state.sessions = [
      { id: "recent-1", title: "Recent One", directory: "/repo/r1", updatedAt: Date.now() - 60000 },
      { id: "recent-2", title: "Recent Two", directory: "/repo/r2", updatedAt: Date.now() - 3600000 }
    ];
    await act(async () => root.render(<SessionsTab open onClose={() => {}} />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    const sections = container.querySelectorAll(".sessions-section");
    const recents = [...sections].find((section) => section.textContent?.includes("Recent sessions"))!;
    expect(recents.textContent).toContain("Recent sessions");
    const rows = recents.querySelectorAll(".sessions-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Recent One");

    await act(async () => (rows[0] as HTMLButtonElement).click());
    expect(state.reopenSession).toHaveBeenCalledWith("recent-1");
  });

  it("lists saved workspaces and opens a new session for one", async () => {
    await act(async () => root.render(<SessionsTab open onClose={() => {}} />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    const sections = container.querySelectorAll(".sessions-section");
    const saved = sections[sections.length - 1];
    expect(saved.textContent).toContain("Saved workspaces");
    const rows = saved.querySelectorAll(".sessions-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Saved A");

    await act(async () => (rows[0] as HTMLButtonElement).click());
    expect(state.openSession).toHaveBeenCalledWith("/saved/a");
  });

  it("marks recent rows that are already running", async () => {
    state.panels = [session("one", "/repo/one", "One")];
    state.panelViews = { [state.panels[0].workspace.id]: { busy: false } };
    state.sessions = [{ id: "one", title: "One", directory: "/repo/one", updatedAt: 1 }];
    await act(async () => root.render(<SessionsTab open onClose={() => {}} />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    const sections = container.querySelectorAll(".sessions-section");
    const recents = sections[1];
    expect(recents.querySelector(".sessions-row")?.classList.contains("running")).toBe(true);
    expect(recents.querySelector(".sessions-row-badge")?.textContent).toBe("open");
  });

  it("groups recent sessions by workspace", async () => {
    state.sessions = [
      { id: "recent-1", title: "Recent One", directory: "/repo/r1", updatedAt: Date.now() - 60000 },
      { id: "recent-2", title: "Recent Two", directory: "/repo/r1", updatedAt: Date.now() - 3600000 },
      { id: "recent-3", title: "Recent Three", directory: "/repo/r2", updatedAt: Date.now() - 7200000 }
    ];
    await act(async () => root.render(<SessionsTab open onClose={() => {}} />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    const sections = container.querySelectorAll(".sessions-section");
    const recents = [...sections].find((section) => section.textContent?.includes("Recent sessions"))!;
    const groups = recents.querySelectorAll(".sessions-group");
    expect(groups).toHaveLength(2);
    expect(groups[0].querySelector(".sessions-group-title")?.textContent).toBe("r1");
    expect(groups[0].querySelectorAll(".sessions-row")).toHaveLength(2);
    expect(groups[1].querySelector(".sessions-group-title")?.textContent).toBe("r2");
    expect(groups[1].querySelectorAll(".sessions-row")).toHaveLength(1);
  });

  it("collapses and expands the recent and saved sections like sidebar panels", async () => {
    state.sessions = [{ id: "recent-1", title: "Recent One", directory: "/repo/r1", updatedAt: 1 }];
    await act(async () => root.render(<SessionsTab open onClose={() => {}} />));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

    const toggles = container.querySelectorAll(".sessions-section .section-toggle");
    expect(toggles).toHaveLength(2);
    expect(container.querySelectorAll(".sessions-row")).toHaveLength(3);

    await act(async () => (toggles[0] as HTMLButtonElement).click());
    expect(container.querySelectorAll(".sessions-row")).toHaveLength(2);
    expect(container.querySelector(".sessions-group")).toBeNull();

    await act(async () => (toggles[1] as HTMLButtonElement).click());
    expect(container.querySelectorAll(".sessions-row")).toHaveLength(0);

    await act(async () => (toggles[0] as HTMLButtonElement).click());
    expect(container.querySelectorAll(".sessions-row")).toHaveLength(1);
  });
});
