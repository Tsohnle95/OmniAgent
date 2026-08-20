import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileSidebar } from "./FileSidebar";

const store = {
  session: { id: "session", directory: "/workspace", workspace: { id: "11111111-1111-4111-8111-111111111111", generation: 1 } },
  selectFolder: vi.fn(),
  tree: { "": [{ path: "dir", type: "directory" as const }, { path: "a.txt", type: "file" as const }] },
  toggleDir: vi.fn(),
  ensureRootOpen: vi.fn(),
  agentFiles: new Map(),
  openFile: vi.fn(),
  expanded: new Set([""]),
  hiddenPaths: new Set<string>(),
  openCtxMenu: vi.fn(),
  pendingCreate: null,
  commitName: vi.fn(),
  cancelPending: vi.fn(),
  ctxMenu: null,
  closeCtxMenu: vi.fn(),
  startCreate: vi.fn(),
  startRename: vi.fn(),
  deleteEntry: vi.fn(),
  removeFromWorkspace: vi.fn(),
  restoreRemovedFromWorkspace: vi.fn()
};

vi.mock("../store", () => ({ useStore: () => store }));

describe("FileSidebar context menu open/close", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    store.ctxMenu = null;
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("opens the menu when More actions is pressed", () => {
    act(() => root.render(<FileSidebar collapsed={false} onCollapse={() => {}} onDrag={() => {}} />));
    const button = [...container.querySelectorAll<HTMLButtonElement>(".tree-row-action")].find(
      (b) => b.title === "More actions…"
    )!;
    expect(button).toBeTruthy();
    act(() => {
      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 50, clientY: 60 }));
    });
    expect(store.openCtxMenu).toHaveBeenCalledTimes(1);
    expect(store.openCtxMenu.mock.calls[0][2]).toEqual({ path: "dir", type: "directory" });
  });

  it("closes the menu when clicking outside", () => {
    store.ctxMenu = { x: 50, y: 60, target: { path: "a.txt", type: "file" as const } };
    act(() => root.render(<FileSidebar collapsed={false} onCollapse={() => {}} onDrag={() => {}} />));
    expect(store.closeCtxMenu).not.toHaveBeenCalled();
    act(() => {
      document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(store.closeCtxMenu).toHaveBeenCalledTimes(1);
  });
});
