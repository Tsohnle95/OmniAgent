import type { OpenShellApi } from "../../preload";

declare global {
  interface Window {
    openshell: OpenShellApi;
  }
}

export {};
