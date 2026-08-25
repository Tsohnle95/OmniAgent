import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderIntegration } from "@shared/types";
import type { OpenShellApi } from "../../../preload";
import { ProviderSettings } from "./ProviderSettings";

const workspace = { id: "11111111-1111-4111-8111-111111111111", generation: 1 };
const openai: ProviderIntegration = {
  id: "openai",
  name: "OpenAI",
  keyMethod: { fields: [] },
  credentials: [],
  environment: { names: ["OPENAI_API_KEY"], connected: [] },
  oauth: [{ id: "oauth", label: "ChatGPT Pro/Plus" }]
};
const azure: ProviderIntegration = {
  id: "azure",
  name: "Azure",
  keyMethod: {
    label: "API key",
    fields: [{ key: "resourceName", type: "string", title: "Resource name", required: true }]
  },
  credentials: [],
  environment: { names: ["AZURE_API_KEY"], connected: [] },
  oauth: []
};

function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ProviderSettings", () => {
  let container: HTMLDivElement;
  let root: Root;
  let previousApi: OpenShellApi;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    previousApi = window.openshell;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    window.openshell = previousApi;
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("connects a provider key with provider-specific fields and never redisplays the secret", async () => {
    const connected = { ...azure, credentials: [{ id: "credential-1", label: "work" }] };
    const providerIntegrations = vi.fn()
      .mockResolvedValueOnce([openai, azure])
      .mockResolvedValueOnce([openai, connected]);
    const connectProviderKey = vi.fn().mockResolvedValue(undefined);
    const refreshModels = vi.fn().mockResolvedValue(undefined);
    window.openshell = { ...previousApi, providerIntegrations, connectProviderKey };

    await act(async () => root.render(<ProviderSettings workspace={workspace} usage={[]} refreshModels={refreshModels} />));
    await act(async () => {});
    const azureCard = [...container.querySelectorAll<HTMLElement>(".provider-card")].find((card) => card.textContent?.includes("Azure"))!;
    act(() => [...azureCard.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Add key")!.click());
    const inputs = azureCard.querySelectorAll<HTMLInputElement>("input");
    act(() => {
      type(inputs[0], "azure-secret");
      type(inputs[1], "work");
      type(inputs[2], "my-models");
    });
    await act(async () => azureCard.querySelector<HTMLFormElement>("form")!.requestSubmit());

    expect(connectProviderKey).toHaveBeenCalledWith(workspace, "azure", "azure-secret", "work", { resourceName: "my-models" });
    expect(refreshModels).toHaveBeenCalled();
    expect(container.textContent).toContain("Connected");
    expect(container.textContent).not.toContain("azure-secret");
  });

  it("searches the full runtime catalog and removes opaque credentials", async () => {
    const connected = { ...openai, credentials: [{ id: "credential-1", label: "default" }] };
    const providerIntegrations = vi.fn().mockResolvedValue([connected, azure]);
    const removeProviderCredential = vi.fn().mockResolvedValue(undefined);
    window.openshell = { ...previousApi, providerIntegrations, removeProviderCredential };
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await act(async () => root.render(<ProviderSettings workspace={workspace} usage={[]} refreshModels={async () => {}} />));
    await act(async () => {});
    const search = container.querySelector<HTMLInputElement>("[aria-label='Search providers']")!;
    act(() => {
      type(search, "openai");
    });
    expect(container.textContent).toContain("OpenAI");
    expect(container.textContent).not.toContain("Azure");

    await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Remove")!.click());
    expect(removeProviderCredential).toHaveBeenCalledWith(workspace, "credential-1");
  });

  it("clears an unsaved secret when the connection form is cancelled", async () => {
    window.openshell = { ...previousApi, providerIntegrations: vi.fn().mockResolvedValue([openai]) };

    await act(async () => root.render(<ProviderSettings workspace={workspace} usage={[]} refreshModels={async () => {}} />));
    await act(async () => {});
    act(() => [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Add key")!.click());
    const secret = container.querySelector<HTMLInputElement>("input[type='password']")!;
    act(() => type(secret, "do-not-retain"));
    act(() => [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Cancel")!.click());
    act(() => [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Add key")!.click());

    expect(container.querySelector<HTMLInputElement>("input[type='password']")?.value).toBe("");
    expect(container.textContent).not.toContain("do-not-retain");
  });
});
