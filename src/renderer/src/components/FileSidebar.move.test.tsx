import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileSidebar } from "./FileSidebar";

const store = {
  session: { id: "session", directory: "/workspace", workspace: { id: "11111111-1111-4111-8111-111111111111", generation: 1 } },
  selectFolder: vi.fn(),
  tree: {
    "": [
      { path: "alpha", type: "directory" as const },
      { path: "beta", type: "directory" as const },
      { path: "note.txt", type: "file" as const }
    ],
    alpha: [
      { path: "alpha/sub", type: "directory" as const },
      { path: "alpha/child.txt", type: "file" as const }
    ],
    "alpha/sub": []
  },
  toggleDir: vi.fn(),
  agentFiles: new Map(),
  openFile: vi.fn(),
  expanded: new Set(["", "alpha", "alpha/sub"]),
  openCtxMenu: vi.fn(),
  pendingCreate: null,
  commitName: vi.fn(),
  cancelPending: vi.fn(),
  ctxMenu: null,
  closeCtxMenu: vi.fn(),
  startCreate: vi.fn(),
  startRename: vi.fn(),
  deleteEntry: vi.fn(),
  moveEntry: vi.fn()
};

vi.mock("../store", () => ({ useStore: () => store }));

function dragEvent(type: string): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { setData: vi.fn(), effectAllowed: "", dropEffect: "" }
  });
  return event;
}

function row(container: HTMLElement, name: string): HTMLElement {
  const found = [...container.querySelectorAll<HTMLElement>(".tree-row")].find(
    (el) => el.querySelector(".tree-name")?.textContent === name
  );
  if (!found) throw new Error(`no tree row for ${name}`);
  return found;
}

describe("FileSidebar drag-and-drop moves", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    store.moveEntry.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("moves a file into a folder on drop", () => {
    act(() => root.render(<FileSidebar collapsed={false} onCollapse={() => {}} onDrag={() => {}} />));
    const source = row(container, "note.txt");
    const target = row(container, "beta");

    act(() => source.dispatchEvent(dragEvent("dragstart")));
    act(() => target.dispatchEvent(dragEvent("dragover")));
    expect(target.className).toContain("drop-target");
    act(() => target.dispatchEvent(dragEvent("drop")));

    expect(store.moveEntry).toHaveBeenCalledWith("note.txt", "beta");
  });

  it("moves a folder into a sibling folder on drop", () => {
    act(() => root.render(<FileSidebar collapsed={false} onCollapse={() => {}} onDrag={() => {}} />));
    const source = row(container, "alpha");
    const target = row(container, "beta");

    act(() => source.dispatchEvent(dragEvent("dragstart")));
    act(() => target.dispatchEvent(dragEvent("dragover")));
    act(() => target.dispatchEvent(dragEvent("drop")));

    expect(store.moveEntry).toHaveBeenCalledWith("alpha", "beta");
  });

  it("drops onto the empty tree area to move to the session root", () => {
    act(() => root.render(<FileSidebar collapsed={false} onCollapse={() => {}} onDrag={() => {}} />));
    const source = row(container, "child.txt");
    const tree = container.querySelector<HTMLElement>(".tree")!;

    act(() => source.dispatchEvent(dragEvent("dragstart")));
    act(() => tree.dispatchEvent(dragEvent("dragover")));
    expect(tree.className).toContain("drop-root");
    act(() => tree.dispatchEvent(dragEvent("drop")));

    expect(store.moveEntry).toHaveBeenCalledWith("alpha/child.txt", "");
  });

  it("rejects dropping a folder onto itself", () => {
    act(() => root.render(<FileSidebar collapsed={false} onCollapse={() => {}} onDrag={() => {}} />));
    const source = row(container, "alpha");

    act(() => source.dispatchEvent(dragEvent("dragstart")));
    act(() => source.dispatchEvent(dragEvent("dragover")));
    act(() => source.dispatchEvent(dragEvent("drop")));

    expect(source.className).not.toContain("drop-target");
    expect(store.moveEntry).not.toHaveBeenCalled();
  });

  it("rejects dropping a folder into its own descendant", () => {
    act(() => root.render(<FileSidebar collapsed={false} onCollapse={() => {}} onDrag={() => {}} />));
    const source = row(container, "alpha");
    const descendant = row(container, "sub");

    act(() => source.dispatchEvent(dragEvent("dragstart")));
    act(() => descendant.dispatchEvent(dragEvent("dragover")));
    act(() => descendant.dispatchEvent(dragEvent("drop")));

    expect(descendant.className).not.toContain("drop-target");
    expect(store.moveEntry).not.toHaveBeenCalled();
  });

  it("rejects dropping an entry onto its current parent", () => {
    act(() => root.render(<FileSidebar collapsed={false} onCollapse={() => {}} onDrag={() => {}} />));
    const source = row(container, "child.txt");
    const parent = row(container, "alpha");

    act(() => source.dispatchEvent(dragEvent("dragstart")));
    act(() => parent.dispatchEvent(dragEvent("dragover")));
    act(() => parent.dispatchEvent(dragEvent("drop")));

    expect(parent.className).not.toContain("drop-target");
    expect(store.moveEntry).not.toHaveBeenCalled();
  });

  it("rejects dropping a file onto a file row", () => {
    act(() => root.render(<FileSidebar collapsed={false} onCollapse={() => {}} onDrag={() => {}} />));
    const source = row(container, "note.txt");
    const other = row(container, "child.txt");
    const tree = container.querySelector<HTMLElement>(".tree")!;

    act(() => source.dispatchEvent(dragEvent("dragstart")));
    act(() => other.dispatchEvent(dragEvent("dragover")));
    act(() => other.dispatchEvent(dragEvent("drop")));

    expect(tree.className).not.toContain("drop-root");
    expect(store.moveEntry).not.toHaveBeenCalled();
  });

  it("clears drag state on dragend", () => {
    act(() => root.render(<FileSidebar collapsed={false} onCollapse={() => {}} onDrag={() => {}} />));
    const source = row(container, "note.txt");
    const target = row(container, "beta");

    act(() => source.dispatchEvent(dragEvent("dragstart")));
    act(() => target.dispatchEvent(dragEvent("dragover")));
    expect(target.className).toContain("drop-target");
    act(() => source.dispatchEvent(dragEvent("dragend")));

    expect(target.className).not.toContain("drop-target");
  });
});
