import ReactDOM from "react-dom/client";
import "@vscode/codicons/dist/codicon.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/700.css";
import "@fontsource/source-code-pro/400.css";
import "@fontsource/source-code-pro/700.css";

// Warm the bundled code fonts so the first editor paint and font switches
// never wait on a cold webfont fetch.
for (const family of ["JetBrains Mono", "Fira Code", "IBM Plex Mono", "Source Code Pro"]) {
  try {
    void document.fonts?.load(`400 12px "${family}"`);
  } catch {
    // System fallback stacks cover load failure.
  }
}
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/main.scss";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
