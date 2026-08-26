import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@shared/types";
import { FileSidebar } from "./FileSidebar";

type MockSession = { id: string; directory: string; workspace: { id: string; generation: number }; title?: string };

const session: MockSession = {
  id: "session",
  directory: "/workspace",
  title: "Current",
  workspace: { id: "11111111-1111-4111-8111-111111111111", generation: 1 }
};

function summary(id: string, directory: string, title: string, updatedAt = Date.now()): SessionSummary {
  return { id, directory, title, updatedAt };
}

const store = {
  session: session as MockSession | null,
  selectFolder: vi.fn(),
  selectFile: vi.fn(),
  tree: {},
  toggleDir: vi.fn(),
  ensureRootOpen: vi.fn(),
  agentFiles: new Map(),
  openFile: vi.fn(),
  expanded: new Set([""]),
  openCtxMenu: vi.fn(),
  pendingCreate: null,
  commitName: vi.fn(),
  cancelPending: vi.fn(),
  startCreate: vi.fn(),
  startRename: vi.fn(),
  deleteEntry: vi.fn(),
  moveEntry: vi.fn(),
  removeFromWorkspace: vi.fn(),
  closePanel: vi.fn(),
  singleFile: null,
  importPaths: vi.fn(),
  dropIntoExplorer: vi.fn(),
  openWorkspacePanel: vi.fn(),
  panels: [] as MockSession[],
  panelViews: {} as Record<string, { busy: boolean }>,
  activeSessionID: null as string | null,
  focusSession: vi.fn(),
  reopenSession: vi.fn(),
  openSession: vi.fn(),
  sessions: [] as SessionSummary[],
  loadSessions: vi.fn(async () => {}),
  runCommand: vi.fn(async () => {}),
  approvalMode: "ask" as const,
  toggleApprovalMode: vi.fn(),
  wordWrap: false,
  toggleWordWrap: vi.fn(),
  followUpBehavior: "queue" as const,
  setFollowUpBehavior: vi.fn()
};

const ctxMenuApi = {
  ctxMenu: null,
  openCtxMenu: vi.fn(),
  closeCtxMenu: vi.fn()
};

vi.mock("../store", () => ({
  useStore: () => store,
  useCtxMenu: () => ctxMenuApi
}));

describe("FileSidebar tabs and sessions pane", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.localStorage.clear();
    store.panels = [];
    store.panelViews = {};
    store.activeSessionID = null;
    store.sessions = [];
    for (const mock of [
      store.focusSession, store.closePanel, store.reopenSession, store.openSession, store.selectFolder, store.selectFile,
      store.loadSessions, store.runCommand, store.toggleWordWrap
    ]) {
      mock.mockClear();
    }
    window.openshell = {
      projects: vi.fn(async () => [{ directory: "/workspace", name: "Workspace" }]),
      commands: vi.fn(async () => [{ name: "compact", description: "Compact the thread" }])
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

  function render(): Promise<void> {
    return act(async () =>
      root.render(<FileSidebar collapsed={false} onCollapse={() => {}} onDrag={() => {}} initialTab="sessions" />)
    );
  }

  async function settle(ms = 10): Promise<void> {
    await act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  function sideTab(title: string): HTMLButtonElement {
    return [...container.querySelectorAll<HTMLButtonElement>(".side-tab")].find(
      (tab) => tab.textContent === title
    )!;
  }

  function section(title: string): HTMLElement {
    return [...container.querySelectorAll<HTMLElement>(".sessions-section")].find((item) =>
      item.querySelector(".section-toggle")?.textContent?.includes(title)
    )!;
  }

  it("opens native folder and file pickers from the sessions pane", async () => {
    await render();
    await settle();

    expect(container.querySelector(".sessions-pane")).not.toBeNull();
    expect(container.querySelector<HTMLElement>(".tree")).toBeNull();

    await act(async () => container.querySelector<HTMLButtonElement>(".sessions-new")!.click());
    expect(store.selectFolder).toHaveBeenCalledOnce();
    expect(store.openSession).not.toHaveBeenCalled();

    await act(async () => container.querySelector<HTMLButtonElement>(".sessions-file")!.click());
    expect(store.selectFile).toHaveBeenCalledOnce();

    expect(store.loadSessions).toHaveBeenCalled();
    expect([...container.querySelectorAll(".sessions-section .section-toggle")].map((toggle) => toggle.textContent)).toEqual([
      "Open now",
      "Workspaces",
      "History"
    ]);
    expect([...container.querySelectorAll(".sessions-section .section-toggle")].map((toggle) => toggle.getAttribute("aria-expanded"))).toEqual(["true", "true", "false"]);
  });

  it("swaps to the files pane with its changes and explorer sections and back", async () => {
    await render();
    await settle();

    await act(async () => sideTab("Files").click());
    expect(container.querySelector(".sessions-pane")).toBeNull();
    const labels = [...container.querySelectorAll(".section-toggle")].map((el) => el.textContent ?? "");
    expect(labels.length).toBe(2);
    expect(labels[0]?.startsWith("CHANGES")).toBe(true);
    expect(labels[1]).toBe("EXPLORER");

    await act(async () => sideTab("Sessions").click());
    expect(container.querySelector(".sessions-pane")).not.toBeNull();
  });

  it("pins a history session and persists the quiet pinned state", async () => {
    store.sessions = [summary("s1", "/workspace", "First"), summary("s2", "/other", "Second")];
    await render();
    await settle();

    const history = section("History");
    await act(async () => history.querySelector<HTMLButtonElement>(".section-toggle")!.click());
    const pin = history.querySelectorAll<HTMLButtonElement>(".sessions-row-pin")[0];
    await act(async () => pin.click());

    expect(JSON.parse(window.localStorage.getItem("openshell.pinnedSessions") ?? "[]")).toEqual(["s1"]);
    expect(history.textContent).toContain("First");
    expect(history.querySelector(".sessions-row-pin")?.classList.contains("pinned")).toBe(true);
  });

  it("lists saved folders under Workspaces and expands their session history", async () => {
    store.sessions = [summary("running", "/workspace", "Running row")];
    await render();
    await settle();

    const workspaces = section("Workspaces");
    const project = workspaces.querySelector<HTMLButtonElement>(".sessions-project-toggle")!;
    expect(project.textContent).toContain("Workspace");
    await act(async () => project.click());
    expect(project.getAttribute("aria-expanded")).toBe("true");
    expect(workspaces.querySelector(".sessions-project-sessions")?.textContent).toContain("Running row");
  });

  it("gives each expanded session group its own scrolling list", async () => {
    store.sessions = [summary("s1", "/workspace", "In project")];
    await render();
    await settle();

    const sections = [...container.querySelectorAll<HTMLElement>(".sessions-section")];
    expect(sections).toHaveLength(3);
    await act(async () => sections[2].querySelector<HTMLButtonElement>(".section-toggle")!.click());
    expect(sections.map((section) => section.querySelectorAll(":scope > .sessions-section-list").length)).toEqual([1, 1, 1]);
    expect(sections[1].textContent).toContain("Workspaces");
  });

  it("focuses running sessions from Open now and reopens closed ones from History", async () => {
    store.sessions = [
      summary("running", "/workspace", "Running row"),
      summary("closed", "/other", "Closed row")
    ];
    store.panels = [{ ...session, id: "running" }];
    store.panelViews = { [store.panels[0].workspace.id]: { busy: true } };
    await render();
    await settle();

    const openNow = section("Open now");
    const runningRow = openNow.querySelector<HTMLElement>(".sessions-row")!;
    expect(runningRow.querySelector(".agent-dot")?.classList.contains("busy")).toBe(true);

    await act(async () => runningRow.click());
    expect(store.focusSession).toHaveBeenCalledWith("running");

    const history = section("History");
    await act(async () => history.querySelector<HTMLButtonElement>(".section-toggle")!.click());
    const closedRow = history.querySelector<HTMLElement>(".sessions-row")!;
    expect(history.textContent).not.toContain("Running row");
    await act(async () => closedRow.click());
    expect(store.reopenSession).toHaveBeenCalledWith("closed");
  });

  it("nests each workspace's sessions under its own dropdown", async () => {
    store.sessions = [summary("s1", "/workspace", "Alpha kernel work"), summary("s2", "/beta", "Beta setup")];
    window.openshell = {
      projects: vi.fn(async () => [{ directory: "/workspace", name: "Workspace" }, { directory: "/beta", name: "Beta" }])
    } as unknown as typeof window.openshell;
    await render();
    await settle();

    const workspaces = section("Workspaces");
    const projectToggles = workspaces.querySelectorAll<HTMLButtonElement>(".sessions-project-toggle");
    expect(projectToggles).toHaveLength(2);

    await act(async () => projectToggles[0].click());
    const firstSessions = workspaces.querySelectorAll<HTMLElement>(".sessions-project-sessions")[0];
    expect(firstSessions.textContent).toContain("Alpha kernel work");
    expect(firstSessions.textContent).not.toContain("Beta setup");

    await act(async () => projectToggles[1].click());
    const nestedSessions = workspaces.querySelectorAll<HTMLElement>(".sessions-project-sessions");
    expect(nestedSessions[1].textContent).toContain("Beta setup");
  });

});
