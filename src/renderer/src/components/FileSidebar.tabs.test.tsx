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

function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

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
      store.focusSession, store.closePanel, store.reopenSession, store.openSession,
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

  it("defaults to the sessions pane with New Session and Plugins actions", async () => {
    await render();
    await settle();

    expect(container.querySelector(".sessions-pane")).not.toBeNull();
    expect(container.querySelector<HTMLElement>(".tree")).toBeNull();

    await act(async () => container.querySelector<HTMLButtonElement>(".sessions-new")!.click());
    expect(store.openSession).toHaveBeenCalledWith("/workspace");

    expect(container.querySelector(".sessions-plugins")).not.toBeNull();
    expect(store.loadSessions).toHaveBeenCalled();
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

  it("pins a recent session, persists it, and lists it under Pinned", async () => {
    store.sessions = [summary("s1", "/workspace", "First"), summary("s2", "/other", "Second")];
    await render();
    await settle();

    expect(container.querySelector(".sessions-section")!.textContent).toContain("No pinned sessions yet.");

    const recents = [...container.querySelectorAll(".sessions-section")].find((el) =>
      el.textContent?.includes("Recents")
    )!;
    const pin = recents.querySelectorAll<HTMLButtonElement>(".sessions-row-pin")[0];
    await act(async () => pin.click());

    expect(JSON.parse(window.localStorage.getItem("openshell.pinnedSessions") ?? "[]")).toEqual(["s1"]);
    const pinned = container.querySelector(".sessions-section")!;
    expect(pinned.textContent).toContain("First");
    expect(pinned.querySelector(".sessions-row-pin")?.classList.contains("pinned")).toBe(true);
  });

  it("expands a project dropdown into its sessions and opens new sessions per project", async () => {
    store.sessions = [summary("s1", "/workspace", "In project")];
    await render();
    await settle();

    const projects = [...container.querySelectorAll(".sessions-section")].find((el) =>
      el.textContent?.includes("Projects")
    )!;
    expect(projects.querySelectorAll(".sessions-project-sessions .sessions-row")).toHaveLength(0);

    await act(async () => projects.querySelector<HTMLElement>(".sessions-project-head")!.click());
    expect(projects.querySelectorAll(".sessions-project-sessions .sessions-row")).toHaveLength(1);

    await act(async () =>
      projects.querySelector<HTMLButtonElement>(".sessions-project-new")!.click()
    );
    expect(store.openSession).toHaveBeenCalledWith("/workspace");
  });

  it("focuses running sessions and reopens closed ones from recents", async () => {
    store.sessions = [
      summary("running", "/workspace", "Running row"),
      summary("closed", "/other", "Closed row")
    ];
    store.panels = [{ ...session, id: "running" }];
    store.panelViews = { [store.panels[0].workspace.id]: { busy: true } };
    await render();
    await settle();

    const rows = [...container.querySelectorAll(".sessions-section")]
      .find((el) => el.textContent?.includes("Recents"))!
      .querySelectorAll<HTMLElement>(".sessions-row");

    expect(rows[0].querySelector(".agent-dot")?.classList.contains("busy")).toBe(true);

    await act(async () => rows[0].click());
    expect(store.focusSession).toHaveBeenCalledWith("running");

    await act(async () => rows[1].click());
    expect(store.reopenSession).toHaveBeenCalledWith("closed");
  });

  it("runs a plugin command from the plugins menu", async () => {
    await render();
    await settle();

    await act(async () => container.querySelector<HTMLButtonElement>(".sessions-plugins")!.click());
    await settle();

    const item = container.querySelector<HTMLButtonElement>(".sessions-plugin-item")!;
    expect(item.textContent).toContain("compact");
    await act(async () => item.click());
    expect(store.runCommand).toHaveBeenCalledWith("compact", undefined);
    expect(container.querySelector(".sessions-plugins-menu")).toBeNull();
  });

  it("filters all sections by the search query", async () => {
    store.sessions = [summary("s1", "/workspace", "Alpha kernel work"), summary("s2", "/beta", "Beta setup")];
    window.openshell = {
      projects: vi.fn(async () => [{ directory: "/workspace", name: "Workspace" }, { directory: "/beta", name: "Beta" }])
    } as unknown as typeof window.openshell;
    await render();
    await settle();

    const input = container.querySelector<HTMLInputElement>(".sessions-search-input")!;
    await act(async () => type(input, "alpha"));
    await settle();

    const titles = [...container.querySelectorAll(".sessions-row-title")].map((el) => el.textContent);
    expect(titles.some((t) => t?.includes("Beta"))).toBe(false);
    expect(titles.some((t) => t?.includes("Alpha"))).toBe(true);
  });

  it("opens the settings page from the footer cog", async () => {
    const onOpenSettings = vi.fn();
    act(() => {
      root.render(<FileSidebar collapsed={false} onCollapse={() => {}} onDrag={() => {}} initialTab="sessions" onOpenSettings={onOpenSettings} />);
    });
    await settle();

    await act(async () => container.querySelector<HTMLButtonElement>(".sidebar-cog")!.click());
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
});
