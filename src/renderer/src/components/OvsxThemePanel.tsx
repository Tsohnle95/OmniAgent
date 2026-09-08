import { useState, type ReactNode } from "react";
import { useTheme } from "../theme";
import { installOvsxTheme, searchOvsxThemes, type OvsxThemeHit } from "../ovsx-themes";

export function OvsxThemePanel(): ReactNode {
  const { setEditorTheme, customEditorThemes, installCustomEditorTheme, removeCustomEditorTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<OvsxThemeHit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);

  const runSearch = async (): Promise<void> => {
    setSearching(true);
    setError(null);
    try {
      const found = await searchOvsxThemes(query);
      setResults(found.hits);
      setTotal(found.total);
    } catch (err) {
      setResults(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const runInstall = async (hit: OvsxThemeHit): Promise<void> => {
    setInstalling(hit.downloadUrl);
    setError(null);
    try {
      const installed = await installOvsxTheme(hit.downloadUrl);
      // Dynamic import keeps monaco-editor out of the settings test graph;
      // the module is already loaded in the running app.
      const { registerEditorTheme } = await import("../monaco");
      for (const theme of installed) {
        registerEditorTheme(theme.id, theme.data);
        installCustomEditorTheme(theme);
      }
      setEditorTheme(installed[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="ovsx-panel">
      <form
        className="ovsx-search"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Open VSX themes…"
          aria-label="Search Open VSX themes"
        />
        <button type="submit" disabled={searching}>{searching ? "Searching…" : "Search"}</button>
      </form>
      {error && <div className="ovsx-error" role="alert">{error}</div>}
      {results && (
        results.length === 0
          ? <div className="settings-empty">No themes matched that search.</div>
          : <>
            <div className="settings-list">
              {results.map((hit) => (
                <div className="settings-list-row" key={`${hit.namespace}/${hit.name}`}>
                  <div>
                    <strong>{hit.displayName}</strong>
                    <small>{hit.description || `${hit.namespace}/${hit.name}`}</small>
                  </div>
                  <button
                    className="ovsx-btn"
                    disabled={installing !== null}
                    onClick={() => void runInstall(hit)}
                  >
                    {installing === hit.downloadUrl ? "Installing…" : "Install"}
                  </button>
                </div>
              ))}
            </div>
            {total > results.length && <p className="settings-note">Showing {results.length} of {total} matches — refine the search to see more.</p>}
          </>
      )}
      {customEditorThemes.length > 0 && (
        <>
          <h2 className="settings-group-title">Installed marketplace themes</h2>
          <div className="settings-list">
            {customEditorThemes.map((theme) => (
              <div className="settings-list-row" key={theme.id}>
                <div>
                  <strong>{theme.name}</strong>
                  <small>{theme.source} · stored offline on this device</small>
                </div>
                <button className="ovsx-btn" onClick={() => removeCustomEditorTheme(theme.id)}>Remove</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
