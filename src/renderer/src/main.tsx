import ReactDOM from "react-dom/client";
import "@vscode/codicons/dist/codicon.css";
import "@fontsource/cormorant-garamond/500.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/main.scss";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
