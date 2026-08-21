import type { ReactNode } from "react";
import { useStore } from "../store";
import { type ThemeId, useTheme } from "../theme";
import { OmniMark } from "./OmniMark";

const themes: Array<{ id: ThemeId; name: string; description: string; colors: string[] }> = [
  {
    id: "paper",
    name: "Paper Editorial",
    description: "Warm paper surfaces, deep ink and the settled clay accent.",
    colors: ["#f4eee1", "#fbf7ec", "#2b2119", "#c25f3c", "#587657"]
  },
  {
    id: "original",
    name: "Original",
    description: "The original warm charcoal OpenShell color profile.",
    colors: ["#171412", "#262220", "#e8e3dd", "#e8875f", "#a9cbad"]
  }
];

export function SettingsPage({ onClose }: { onClose: () => void }): ReactNode {
  const { theme, setTheme } = useTheme();
  const { approvalMode, toggleApprovalMode, wordWrap, toggleWordWrap, followUpBehavior, setFollowUpBehavior } = useStore();

  return (
    <main className="settings-page">
      <header className="settings-page-header">
        <div className="settings-page-brand"><OmniMark size={34} /></div>
        <div>
          <p className="settings-page-kicker">OmniAgent preferences</p>
          <h1>Settings</h1>
          <p>Shape the workspace without changing how your agents work.</p>
        </div>
        <button className="settings-close" onClick={onClose}>Back to workspace</button>
      </header>

      <section className="settings-section" aria-labelledby="appearance-heading">
        <div className="settings-section-heading">
          <span>01</span>
          <div><h2 id="appearance-heading">Appearance</h2><p>Color profiles apply to the complete interface and editor.</p></div>
        </div>
        <div className="theme-grid" role="radiogroup" aria-label="Color theme">
          {themes.map((option) => (
            <button
              key={option.id}
              className={`theme-card ${theme === option.id ? "selected" : ""}`}
              role="radio"
              aria-checked={theme === option.id}
              onClick={() => setTheme(option.id)}
            >
              <span className={`theme-preview theme-preview-${option.id}`}>
                <span className="theme-preview-sidebar" />
                <span className="theme-preview-editor"><i /><i /><i /></span>
                <span className="theme-preview-agent" />
              </span>
              <span className="theme-card-copy"><strong>{option.name}</strong><small>{option.description}</small></span>
              <span className="theme-swatches">{option.colors.map((color) => <i key={color} style={{ background: color }} />)}</span>
              <span className="theme-check">{theme === option.id ? "Selected" : "Select"}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="behavior-heading">
        <div className="settings-section-heading">
          <span>02</span>
          <div><h2 id="behavior-heading">Agent behavior</h2><p>Defaults used while sessions are running.</p></div>
        </div>
        <div className="settings-list">
          <div className="settings-list-row">
            <div><strong>Permissions</strong><small>Choose whether tool actions need confirmation.</small></div>
            <span className="settings-segmented">
              <button className={approvalMode !== "approve" ? "on" : ""} onClick={() => approvalMode === "approve" && toggleApprovalMode()}>Ask</button>
              <button className={approvalMode === "approve" ? "on" : ""} onClick={() => approvalMode !== "approve" && toggleApprovalMode()}>Approve</button>
            </span>
          </div>
          <div className="settings-list-row">
            <div><strong>Word wrap</strong><small>Wrap long editor lines to the available width.</small></div>
            <button className={`settings-switch ${wordWrap ? "on" : ""}`} role="switch" aria-checked={wordWrap} onClick={toggleWordWrap}><span /></button>
          </div>
          <div className="settings-list-row">
            <div><strong>Follow-ups</strong><small>Queue new prompts or use them to steer active work.</small></div>
            <span className="settings-segmented">
              <button className={followUpBehavior !== "steer" ? "on" : ""} onClick={() => setFollowUpBehavior("queue")}>Queue</button>
              <button className={followUpBehavior === "steer" ? "on" : ""} onClick={() => setFollowUpBehavior("steer")}>Steer</button>
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
