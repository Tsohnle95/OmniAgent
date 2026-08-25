import type { ReactNode } from "react";
import { IconCloudDownload, IconDashboard, IconEye, IconGear, IconMic, IconRobot, IconShield, IconSymbolEvent } from "./icons";

export type SettingsSection =
  | "appearance"
  | "plugins"
  | "providers"
  | "safety"
  | "voice"
  | "model"
  | "mobile"
  | "about";

const primarySections: Array<{ id: SettingsSection; label: string; icon: ReactNode }> = [
  { id: "appearance", label: "Appearance", icon: <IconEye /> },
  { id: "plugins", label: "Plugins", icon: <IconSymbolEvent /> },
  { id: "providers", label: "Providers", icon: <IconCloudDownload /> },
  { id: "safety", label: "Safety", icon: <IconShield /> },
  { id: "voice", label: "Voice", icon: <IconMic /> },
  { id: "model", label: "Model", icon: <IconRobot /> },
  { id: "mobile", label: "Mobile Setup", icon: <IconDashboard /> },
  { id: "about", label: "About", icon: <IconDashboard /> }
];

export function SettingsSidebar({
  section,
  onSectionChange,
  settingsActive = false,
  onToggleSettings
}: {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  settingsActive?: boolean;
  onToggleSettings?: () => void;
}): ReactNode {
  const item = (id: SettingsSection, label: string, icon: ReactNode): ReactNode => (
    <button
      key={id}
      className={`settings-nav-item ${section === id ? "active" : ""}`}
      aria-current={section === id ? "page" : undefined}
      onClick={() => onSectionChange(id)}
    >
      <span className="settings-nav-mark" aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <aside className="sidebar settings-sidebar">
      <header className="settings-sidebar-header">
        <span className="settings-sidebar-kicker">Preferences</span>
        <strong>Settings</strong>
      </header>
      <nav className="settings-nav" aria-label="Settings sections">
        {primarySections.map(({ id, label, icon }) => item(id, label, icon))}
      </nav>
      <div className="sidebar-footer">
        <button
          className={`icon-btn sidebar-settings-btn ${settingsActive ? "on" : ""}`}
          title={settingsActive ? "Back to workspace" : "Settings"}
          aria-label={settingsActive ? "Back to workspace" : "Settings"}
          aria-pressed={settingsActive}
          onClick={() => onToggleSettings?.()}
        >
          <IconGear />
        </button>
      </div>
    </aside>
  );
}
