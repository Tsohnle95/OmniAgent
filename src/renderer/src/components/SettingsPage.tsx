import { useEffect, useState, type ReactNode } from "react";
import type { CommandOption } from "@shared/types";
import { useStore } from "../store";
import { type ThemeId, useTheme } from "../theme";
import { OmniMark } from "./OmniMark";
import type { SettingsSection } from "./SettingsSidebar";

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
    description: "OmniAgent's original warm charcoal color profile.",
    colors: ["#171412", "#262220", "#e8e3dd", "#e8875f", "#a9cbad"]
  }
];

const sectionCopy: Record<SettingsSection, { title: string; description: string }> = {
  appearance: { title: "Appearance", description: "Choose how OmniAgent looks and how code is presented." },
  plugins: { title: "Plugins", description: "Review commands and skills available in the current workspace." },
  providers: { title: "Providers", description: "See the model services connected through OpenCode." },
  safety: { title: "Safety", description: "Set permission and follow-up defaults for agent behavior." },
  voice: { title: "Voice", description: "Configure voice input preferences and review availability." },
  model: { title: "Model", description: "Choose the model used by the current workspace." },
  mobile: { title: "Mobile Setup", description: "Prepare secure access to OmniAgent from another device." },
  about: { title: "About", description: "Version and product information for this installation." }
};

function SettingRow({ title, detail, control }: { title: string; detail: string; control: ReactNode }): ReactNode {
  return (
    <div className="settings-list-row">
      <div><strong>{title}</strong><small>{detail}</small></div>
      {control}
    </div>
  );
}

export function SettingsPage({ section, onClose }: { section: SettingsSection; onClose: () => void }): ReactNode {
  const { theme, setTheme } = useTheme();
  const {
    session,
    models,
    currentModel,
    switchModel,
    providerUsage,
    approvalMode,
    toggleApprovalMode,
    wordWrap,
    toggleWordWrap,
    followUpBehavior,
    setFollowUpBehavior
  } = useStore();
  const [commands, setCommands] = useState<CommandOption[]>([]);
  const copy = sectionCopy[section];

  useEffect(() => {
    if (section !== "plugins") return;
    if (!session) {
      setCommands([]);
      return;
    }
    void window.openshell.commands(session.workspace).then(setCommands).catch(() => setCommands([]));
  }, [section, session]);

  return (
    <main className="settings-page">
      <header className="settings-page-header">
        <div className="settings-page-brand"><OmniMark size={34} /></div>
        <div>
          <p className="settings-page-kicker">OmniAgent preferences</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
        <button className="settings-close" onClick={onClose}>Back to workspace</button>
      </header>

      {section === "appearance" && <section className="settings-section" aria-label="Appearance settings">
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
        <div className="settings-list">
          <SettingRow
            title="Word wrap"
            detail="Wrap long editor lines to the available width."
            control={<button className={`settings-switch ${wordWrap ? "on" : ""}`} role="switch" aria-checked={wordWrap} onClick={toggleWordWrap}><span /></button>}
          />
        </div>
      </section>}

      {section === "plugins" && <section className="settings-section">
        <div className="settings-list">
          {commands.length === 0 ? <div className="settings-empty">No workspace commands or skills were reported.</div> : commands.map((command) => (
            <SettingRow key={`${command.kind}:${command.name}`} title={command.name} detail={command.description ?? "No description provided."} control={<span className="settings-badge">{command.kind ?? "command"}</span>} />
          ))}
        </div>
      </section>}

      {section === "providers" && <section className="settings-section">
        <div className="settings-list">
          {providerUsage.length === 0 ? <div className="settings-empty">Provider details appear after OpenCode reports a connected account.</div> : providerUsage.map((provider) => (
            <SettingRow key={provider.provider} title={provider.displayName} detail={provider.snapshot?.planType ?? provider.error?.message ?? "Connected through OpenCode"} control={<span className={`settings-badge ${provider.status}`}>{provider.status}</span>} />
          ))}
        </div>
      </section>}

      {section === "safety" && <section className="settings-section">
        <div className="settings-list">
          <SettingRow
            title="Tool permissions"
            detail="Choose whether agent tool actions need confirmation."
            control={<span className="settings-segmented"><button className={approvalMode !== "approve" ? "on" : ""} onClick={() => approvalMode === "approve" && toggleApprovalMode()}>Ask</button><button className={approvalMode === "approve" ? "on" : ""} onClick={() => approvalMode !== "approve" && toggleApprovalMode()}>Approve</button></span>}
          />
          <SettingRow
            title="Follow-up behavior"
            detail="Queue new prompts or use them to steer active work."
            control={<span className="settings-segmented"><button className={followUpBehavior !== "steer" ? "on" : ""} onClick={() => setFollowUpBehavior("queue")}>Queue</button><button className={followUpBehavior === "steer" ? "on" : ""} onClick={() => setFollowUpBehavior("steer")}>Steer</button></span>}
          />
        </div>
      </section>}

      {section === "voice" && <section className="settings-section">
        <div className="settings-list">
          <SettingRow title="Voice input" detail="Voice transcription is not included in this build. Controls will appear here when a voice service is available." control={<span className="settings-badge">Unavailable</span>} />
        </div>
      </section>}

      {section === "model" && <section className="settings-section">
        <div className="settings-list">
          <SettingRow
            title="Default model"
            detail={session ? `Used for new prompts in ${session.directory}.` : "Open a workspace to choose its default model."}
            control={<select className="settings-select" value={currentModel ? `${currentModel.providerID}:${currentModel.id}` : ""} disabled={!session || models.length === 0} onChange={(event) => {
              const model = models.find((option) => `${option.providerID}:${option.id}` === event.target.value);
              if (model) void switchModel(model.id, model.providerID, model.variant);
            }}><option value="">{models.length === 0 ? "No models available" : "Select a model"}</option>{models.map((model) => <option key={`${model.providerID}:${model.id}`} value={`${model.providerID}:${model.id}`}>{model.name} · {model.providerID}</option>)}</select>}
          />
        </div>
      </section>}

      {section === "mobile" && <section className="settings-section">
        <div className="settings-callout"><strong>Mobile access is not enabled.</strong><p>OmniAgent currently runs as a local desktop application. A future mobile setup flow will provide pairing and session controls without exposing the workspace directly to the network.</p></div>
      </section>}

      {section === "about" && <section className="settings-section">
        <div className="settings-about"><OmniMark size={72} /><div><h2>OmniAgent</h2><p>Version 0.1.0</p><small>A native desktop cockpit for coding agents.</small></div></div>
      </section>}
    </main>
  );
}
