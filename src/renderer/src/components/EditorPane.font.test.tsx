import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionInfo, Tab } from "@shared/types";
import { EditorPane } from "./EditorPane";
import { ThemeProvider, useTheme } from "../theme";

let capturedOptions: { fontFamily?: string; fontSize?: number } | null = null;
let themeApi: Pick<ReturnType<typeof useTheme>, "setEditorFont" | "setEditorFontSize"> | null = null;

function ThemeProbe(): ReactNode {
  const { setEditorFont, setEditorFontSize } = useTheme();
  themeApi = { setEditorFont, setEditorFontSize };
  return null;
}

vi.mock("../monaco", () => ({
  languageForPath: () => "javascript",
  ensureEffectiveEditorTheme: ({ editorTheme }: { editorTheme: string }) => editorTheme,
  monaco: { editor: { setModelMarkers: vi.fn() } }
}));
vi.mock("@monaco-editor/react", () => ({
  default: (props: { options?: { fontFamily?: string; fontSize?: number } }) => {
    capturedOptions = props.options ?? null;
    return <div data-testid="editor" />;
  },
  DiffEditor: () => <div data-testid="diff-editor" />
}));
vi.mock("../emmet-keys", () => ({ wireEmmetKeys: vi.fn() }));

const tab: Tab = {
  path: "src/app.js",
  name: "app.js",
  content: "const x = 1;",
  saved: "const x = 1;",
  baseline: null,
  mode: "edit",
  dirty: false,
  stale: false,
  deleted: false,
  revision: 0,
  conflict: null,
  binary: false
};
const session: SessionInfo = {
  id: "session",
  directory: "/workspace",
  workspace: { id: "11111111-1111-4111-8111-111111111111", generation: 1 }
};
const store = {
  session,
  tabs: [tab],
  activePath: tab.path,
  setActive: vi.fn(),
  closeTab: vi.fn(),
  setTabMode: vi.fn(),
  editContent: vi.fn(),
  saveTab: vi.fn(),
  reloadTab: vi.fn(),
  overwriteTab: vi.fn(),
  mergeTab: vi.fn(),
  wordWrap: false,
  toggleWordWrap: vi.fn(),
  openPaths: vi.fn()
};
vi.mock("../store", () => ({ useStore: () => store }));

describe("editor font plumbing", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.localStorage.clear();
    capturedOptions = null;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("passes the selected font family and size to the Monaco component", () => {
    act(() => root.render(<ThemeProvider><ThemeProbe /><EditorPane /></ThemeProvider>));
    expect(capturedOptions?.fontFamily).toContain("SF Mono");
    expect(capturedOptions?.fontSize).toBe(13);

    act(() => themeApi?.setEditorFont("fira-code"));
    expect(capturedOptions?.fontFamily).toContain("Fira Code");

    act(() => themeApi?.setEditorFontSize(16));
    expect(capturedOptions?.fontSize).toBe(16);
  });
});
