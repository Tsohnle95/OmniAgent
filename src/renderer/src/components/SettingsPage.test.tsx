import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "../theme";
import { SettingsPage } from "./SettingsPage";
import { SettingsSidebar } from "./SettingsSidebar";

const store = {
  session: null,
  models: [],
  currentModel: null,
  switchModel: vi.fn(),
  providerUsage: [],
  approvalMode: "ask",
  toggleApprovalMode: vi.fn(),
  wordWrap: false,
  toggleWordWrap: vi.fn(),
  followUpBehavior: "queue",
  setFollowUpBehavior: vi.fn()
};

vi.mock("../store", () => ({ useStore: () => store }));

describe("SettingsPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
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

  it("offers the new and original profiles and persists selection", () => {
    act(() => root.render(<ThemeProvider><SettingsPage section="appearance" onClose={() => {}} /></ThemeProvider>));

    const cards = [...container.querySelectorAll<HTMLButtonElement>(".theme-card")];
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining("Paper Editorial"),
      expect.stringContaining("Original")
    ]);
    expect(document.documentElement.dataset.theme).toBe("paper");

    act(() => cards[1].click());
    expect(document.documentElement.dataset.theme).toBe("original");
    expect(window.localStorage.getItem("omniagent.theme")).toBe("original");
    expect(cards[1].getAttribute("aria-checked")).toBe("true");
  });

  it("provides dedicated settings navigation with About at the bottom", () => {
    const onSectionChange = vi.fn();
    const onClose = vi.fn();
    act(() => root.render(<SettingsSidebar section="appearance" onSectionChange={onSectionChange} onClose={onClose} />));

    const labels = [...container.querySelectorAll<HTMLButtonElement>(".settings-nav-item")].map((button) => button.textContent);
    expect(labels).toEqual(["Appearance", "Plugins", "Providers", "Safety", "Voice", "Model", "Mobile Setup", "About"]);
    expect(container.querySelector(".settings-nav-bottom")?.textContent).toContain("About");

    act(() => container.querySelectorAll<HTMLButtonElement>(".settings-nav-item")[5].click());
    expect(onSectionChange).toHaveBeenCalledWith("model");
    act(() => container.querySelector<HTMLButtonElement>(".sidebar-cog")!.click());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
