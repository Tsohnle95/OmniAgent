import { useEffect, useState, type ReactNode } from "react";
import type { CommandOption, McpServerOption, PluginOption, RuntimeID, SkillOption } from "@shared/types";
import { useStore } from "../store";
import { type ThemeId, useTheme } from "../theme";
import { OrbitMark } from "./OrbitMark";
import { ProviderSettings } from "./ProviderSettings";
import type { SettingsSection } from "./SettingsSidebar";

const themes: Array<{ id: ThemeId; name: string; description: string; colors: string[] }> = [
  {
    id: "paper",
    name: "Paper Editorial",
    description: "Warm paper surfaces, deep ink and the settled clay accent.",
    colors: ["#f4eee1", "#fbf7ec", "#2b2119", "#617a68", "#948571"]
  },
  {
    id: "original",
    name: "Original",
    description: "Orbit's original warm charcoal color profile.",
    colors: ["#171412", "#262220", "#e8e3dd", "#9eb4a1", "#a8a29e"]
  }
];

const sectionCopy: Record<SettingsSection, { title: string; description: string }> = {
  appearance: { title: "Appearance", description: "Choose how Orbit looks and how code is presented." },
  plugins: { title: "Plugins", description: "Review commands and skills available in the current workspace." },
  providers: { title: "Providers", description: "Connect model services supported by your active agent runtime." },
  safety: { title: "Safety", description: "Set permission and follow-up defaults for agent behavior." },
  voice: { title: "Voice", description: "Configure voice input preferences and review availability." },
  model: { title: "Model", description: "Choose the model used by the current workspace." },
  mobile: { title: "Mobile Setup", description: "Prepare secure access to Orbit from another device." },
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
    runtimes,
    models,
    currentModel,
    switchModel,
    loadModels,
    providerUsage,
    refreshProviderUsage,
    approvalMode,
    toggleApprovalMode,
    wordWrap,
    toggleWordWrap,
    followUpBehavior,
    setFollowUpBehavior,
    selectedRuntimeID,
    setSelectedRuntimeID
  } = useStore();
  const [commands, setCommands] = useState<CommandOption[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerOption[]>([]);
  const [plugins, setPlugins] = useState<PluginOption[]>([]);
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const copy = sectionCopy[section];
  const runtime = (runtimes ?? []).find((item) => item.id === (session?.runtimeID ?? "opencode"));

  useEffect(() => {
    if (section !== "plugins") return;
    if (!session) {
      setCommands([]);
      setMcpServers([]);
      setPlugins([]);
      setSkills([]);
      return;
    }
    void window.openshell.commands(session.workspace).then(setCommands).catch(() => setCommands([]));
    void window.openshell.mcpList(session.workspace).then(setMcpServers).catch(() => setMcpServers([]));
    void window.openshell.pluginsList(session.workspace).then(setPlugins).catch(() => setPlugins([]));
    void window.openshell.skillsList(session.workspace).then(setSkills).catch(() => setSkills([]));
  }, [section, session]);

  useEffect(() => {
    if (section === "providers" && session) void refreshProviderUsage();
  }, [section, session?.id, refreshProviderUsage]);

  return (
    <main className="settings-page">
      <header className="settings-page-header">
        <div className="settings-page-brand"><OrbitMark size={34} /></div>
        <div>
          <p className="settings-page-kicker">Orbit preferences</p>
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
        <h2 className="settings-group-title">Skills</h2>
        <div className="settings-list">
          {skills.length === 0 ? <div className="settings-empty">No skills are available in this workspace.</div> : skills.map((skill) => (
            <SettingRow key={skill.id} title={skill.name} detail={skill.description ?? skill.location ?? "No description provided."} control={<span className="settings-badge">{skill.slash ? "slash" : "skill"}</span>} />
          ))}
        </div>
        <h2 className="settings-group-title">Plugins</h2>
        <div className="settings-list">
          {plugins.length === 0 ? <div className="settings-empty">No plugins are active in this workspace.</div> : plugins.map((plugin) => (
            <SettingRow key={plugin.id} title={plugin.id} detail={`Source: ${plugin.source}`} control={<span className="settings-badge">{plugin.status}</span>} />
          ))}
        </div>
        <h2 className="settings-group-title">MCP servers</h2>
        <div className="settings-list">
          {mcpServers.length === 0 ? <div className="settings-empty">No MCP servers are configured for this workspace.</div> : mcpServers.map((server) => (
            <SettingRow key={server.name} title={server.name} detail="Managed by the OpenCode runtime." control={<span className={`settings-badge ${server.status === "connected" ? "available" : ""}`}>{server.status}</span>} />
          ))}
        </div>
      </section>}

      {section === "providers" && <section className="settings-section">
        {runtime && !runtime.capabilities.providerCredentials
          ? <div className="settings-callout"><strong>Managed by {runtime.name}</strong><p>This runtime does not expose provider credential editing through Orbit. Configure credentials in the runtime, then refresh its model list here.</p></div>
          : <ProviderSettings workspace={session?.workspace ?? null} usage={providerUsage} refreshModels={() => loadModels(session?.workspace)} />}
      </section>}

      {section === "safety" && <section className="settings-section">
        <div className="settings-list">
          {(!runtime || runtime.capabilities.permissions) && <SettingRow
            title="Tool permissions"
            detail="Choose whether agent tool actions need confirmation."
            control={<span className="settings-segmented"><button className={approvalMode !== "approve" ? "on" : ""} onClick={() => approvalMode === "approve" && toggleApprovalMode()}>Ask</button><button className={approvalMode === "approve" ? "on" : ""} onClick={() => approvalMode !== "approve" && toggleApprovalMode()}>Approve</button></span>}
          />}
          {(!runtime || runtime.capabilities.steering) && <SettingRow
            title="Follow-up behavior"
            detail="Queue new prompts or use them to steer active work."
            control={<span className="settings-segmented"><button className={followUpBehavior !== "steer" ? "on" : ""} onClick={() => setFollowUpBehavior("queue")}>Queue</button><button className={followUpBehavior === "steer" ? "on" : ""} onClick={() => setFollowUpBehavior("steer")}>Steer</button></span>}
          />}
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
            title="Agent runtime"
            detail="Choose which agent runtime handles sessions. Open sessions keep their runtime until the next app launch, which reopens them under this mode."
            control={<select className="settings-select" value={selectedRuntimeID} onChange={(event) => setSelectedRuntimeID(event.target.value as RuntimeID)}>{(runtimes.length > 0 ? runtimes : [{ id: "opencode", name: "OpenCode", version: null, available: true }]).map((runtime) => (
              <option key={runtime.id} value={runtime.id} disabled={!runtime.available}>{runtime.name}{runtime.version ? ` ${runtime.version}` : ""}{runtime.available ? "" : " (not installed)"}</option>
            ))}</select>}
          />
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
        <div className="settings-callout"><strong>Mobile access is not enabled.</strong><p>Orbit currently runs as a local desktop application. A future mobile setup flow will provide pairing and session controls without exposing the workspace directly to the network.</p></div>
      </section>}

      {section === "about" && <section className="settings-section">
        <div className="settings-about"><OrbitMark size={72} /><div><h2>Orbit</h2><p>Version 0.1.0</p><small>A native desktop cockpit for coding agents.</small></div></div>
      </section>}
    </main>
  );
}
