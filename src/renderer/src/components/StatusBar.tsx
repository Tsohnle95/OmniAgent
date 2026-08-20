import { useEffect, useRef, useState, type ReactNode } from "react";
import { useStore } from "../store";
import { applyW3cMarkers } from "../w3c-validation";

const W3C_FILE = /\.(?:html?|css)$/i;

interface ValidateResult {
  errors: number;
  warnings: number;
  failed: boolean;
}

export function StatusBar(): ReactNode {
  const { tabs, activePath } = useStore();
  const activeTab = tabs.find((tab) => tab.path === activePath);
  const w3cFile = activeTab !== undefined && W3C_FILE.test(activeTab.path);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ValidateResult | null>(null);
  const runIdRef = useRef(0);

  useEffect(() => {
    runIdRef.current += 1;
    setRunning(false);
    setResult(null);
  }, [activePath, activeTab?.content]);

  const validate = (): void => {
    if (!activeTab || !w3cFile || running) return;
    const runId = ++runIdRef.current;
    setRunning(true);
    setResult(null);
    void window.openshell.validateW3c(activeTab.path, activeTab.content)
      .then((diagnostics) => {
        if (runId !== runIdRef.current) return;
        applyW3cMarkers(activeTab.path, diagnostics);
        const errors = diagnostics.filter((d) => d.severity === "error").length;
        setRunning(false);
        setResult({ errors, warnings: diagnostics.length - errors, failed: false });
      })
      .catch(() => {
        if (runId !== runIdRef.current) return;
        setRunning(false);
        setResult({ errors: 0, warnings: 0, failed: true });
      });
  };

  const resultText = result
    ? result.failed
      ? "Validation failed"
      : result.errors > 0
        ? `${result.errors} error${result.errors === 1 ? "" : "s"}${result.warnings > 0 ? `, ${result.warnings} warning${result.warnings === 1 ? "" : "s"}` : ""}`
        : result.warnings > 0
          ? `${result.warnings} warning${result.warnings === 1 ? "" : "s"}`
          : "No problems"
    : null;

  const resultTone = result
    ? result.failed
      ? "failed"
      : result.errors > 0
        ? "has-errors"
        : result.warnings > 0
          ? "has-warnings"
          : "clean"
    : "";

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        <button
          className="statusbar-btn validate-btn"
          data-testid="validate-btn"
          disabled={!w3cFile || running}
          title={!activeTab
            ? "Open a file to validate"
            : !w3cFile
              ? "W3C validation supports HTML and CSS files"
              : "Run the W3C Nu Html Checker / CSS Validator on the open file"}
          onClick={validate}
        >
          {running && <span className="validate-spinner" aria-hidden="true" />}
          {running ? "Validating…" : "Validate"}
        </button>
        {resultText && (
          <span className={`validate-result ${resultTone}`} data-testid="validate-result">
            {resultText}
          </span>
        )}
      </div>
      <div className="statusbar-right">
        {activeTab && (
          <span className="statusbar-item statusbar-path" title={activeTab.path}>
            {activeTab.path}
          </span>
        )}
      </div>
    </div>
  );
}