import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type {
  ProviderCredentialAnswers,
  ProviderCredentialValue,
  ProviderFormField,
  ProviderIntegration,
  ProviderUsageResult,
  WorkspaceIdentity
} from "@shared/types";
import { ExternalLink } from "./ExternalLink";

const POPULAR_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "opencode",
  "google",
  "openrouter",
  "deepseek",
  "xai",
  "groq",
  "mistral",
  "alibaba",
  "amazon-bedrock",
  "azure",
  "cohere",
  "perplexity",
  "togetherai",
  "fireworks-ai",
  "cerebras",
  "huggingface",
  "nvidia",
  "zai"
] as const;

const PROVIDER_LABELS: Record<string, string> = {
  alibaba: "Qwen / Alibaba",
  google: "Google Gemini",
  zai: "Z.AI / GLM"
};

function providerName(provider: ProviderIntegration): string {
  return PROVIDER_LABELS[provider.id] ?? provider.name;
}

function initialAnswers(fields: ProviderFormField[]): ProviderCredentialAnswers {
  return Object.fromEntries(fields.flatMap((field) => field.default === undefined ? [] : [[field.key, field.default]]));
}

function fieldVisible(field: ProviderFormField, answers: ProviderCredentialAnswers): boolean {
  return (field.when ?? []).every((condition) => condition.op === "eq"
    ? answers[condition.key] === condition.value
    : answers[condition.key] !== condition.value);
}

function fieldControl(
  field: ProviderFormField,
  value: ProviderCredentialValue | undefined,
  setValue: (value: ProviderCredentialValue) => void
): ReactNode {
  if (field.type === "external") {
    return field.url ? <ExternalLink className="provider-external" href={field.url}>Open setup instructions</ExternalLink> : null;
  }
  if (field.type === "boolean") {
    return <input type="checkbox" checked={value === true} onChange={(event) => setValue(event.target.checked)} />;
  }
  if (field.type === "multiselect") {
    return (
      <select multiple value={Array.isArray(value) ? value : []} onChange={(event) => setValue([...event.target.selectedOptions].map((option) => option.value))}>
        {(field.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }
  if (field.options) {
    return (
      <select value={typeof value === "string" ? value : ""} onChange={(event) => setValue(event.target.value)} required={field.required}>
        <option value="">Select</option>
        {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }
  return (
    <input
      type={field.type === "number" || field.type === "integer" ? "number" : "text"}
      step={field.type === "integer" ? 1 : undefined}
      min={field.minimum}
      max={field.maximum}
      minLength={field.minLength}
      maxLength={field.maxLength}
      pattern={field.pattern}
      placeholder={field.placeholder}
      value={typeof value === "string" || typeof value === "number" ? value : ""}
      required={field.required}
      onChange={(event) => setValue(field.type === "number" || field.type === "integer"
        ? (event.target.value === "" ? "" : event.target.valueAsNumber)
        : event.target.value)}
    />
  );
}

function ProviderCard({
  provider,
  usage,
  workspace,
  refresh,
  refreshModels
}: {
  provider: ProviderIntegration;
  usage?: ProviderUsageResult;
  workspace: WorkspaceIdentity;
  refresh: () => Promise<void>;
  refreshModels: () => Promise<void>;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [answers, setAnswers] = useState<ProviderCredentialAnswers>(() => initialAnswers(provider.keyMethod?.fields ?? []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = provider.credentials.length > 0 || provider.environment.connected.length > 0;
  const displayName = providerName(provider);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!provider.keyMethod || !key) return;
    setSaving(true);
    setError(null);
    try {
      const visibleKeys = new Set(provider.keyMethod.fields.filter((field) => field.type !== "external" && fieldVisible(field, answers)).map((field) => field.key));
      const submittedAnswers = Object.fromEntries(Object.entries(answers).filter(([answerKey, value]) => visibleKeys.has(answerKey) && value !== "" && (!Array.isArray(value) || value.length > 0)));
      await window.openshell.connectProviderKey(workspace, provider.id, key, label, submittedAnswers);
      setKey("");
      setLabel("");
      setOpen(false);
      await Promise.all([refresh(), refreshModels()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (credentialID: string): Promise<void> => {
    if (!window.confirm(`Remove this ${displayName} credential?`)) return;
    setSaving(true);
    setError(null);
    try {
      await window.openshell.removeProviderCredential(workspace, credentialID);
      await Promise.all([refresh(), refreshModels()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className={`provider-card ${connected ? "connected" : ""}`}>
      <div className="provider-card-heading">
        <span className="provider-monogram">{displayName.slice(0, 2).toUpperCase()}</span>
        <div><strong>{displayName}</strong><small>{provider.id}</small></div>
        <span className={`settings-badge ${connected ? "available" : ""}`}>{connected ? "Connected" : "Available"}</span>
      </div>

      {provider.credentials.length > 0 && <div className="provider-connections">
        {provider.credentials.map((credential) => (
          <div key={credential.id}><span><i />{credential.label}</span><button disabled={saving} onClick={() => void remove(credential.id)}>Remove</button></div>
        ))}
      </div>}

      {provider.environment.connected.length > 0 && <p className="provider-note">Connected from {provider.environment.connected.join(", ")}</p>}
      {usage?.snapshot?.planType && <p className="provider-note">Plan: {usage.snapshot.planType}</p>}

      {open && provider.keyMethod ? (
        <form className="provider-key-form" onSubmit={(event) => void submit(event)}>
          <label><span>{provider.keyMethod.label ?? "API key"}</span><input type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} required autoFocus /></label>
          <label><span>Label <small>optional</small></span><input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Work, personal, team..." /></label>
          {provider.keyMethod.fields.filter((field) => fieldVisible(field, answers)).map((field) => (
            <label key={field.key}>
              <span>{field.title ?? field.key}{field.required ? " *" : ""}</span>
              {fieldControl(field, answers[field.key], (value) => setAnswers((current) => ({ ...current, [field.key]: value })))}
              {field.description && <small>{field.description}</small>}
            </label>
          ))}
          {error && <p className="provider-error">{error}</p>}
          <div className="provider-form-actions"><button type="button" onClick={() => { setKey(""); setLabel(""); setAnswers(initialAnswers(provider.keyMethod?.fields ?? [])); setOpen(false); }}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Connecting..." : "Connect provider"}</button></div>
        </form>
      ) : (
        <div className="provider-card-footer">
          <span>{provider.environment.names.length > 0 ? `Also supports ${provider.environment.names.join(", ")}` : provider.oauth.length > 0 ? "OAuth available through the active runtime" : "API key connection"}</span>
          {provider.keyMethod && <button onClick={() => { setKey(""); setLabel(""); setAnswers(initialAnswers(provider.keyMethod?.fields ?? [])); setOpen(true); }}>Add key</button>}
        </div>
      )}
      {!open && error && <p className="provider-error">{error}</p>}
    </article>
  );
}

export function ProviderSettings({
  workspace,
  usage,
  refreshModels
}: {
  workspace: WorkspaceIdentity | null;
  usage: ProviderUsageResult[];
  refreshModels: () => Promise<void>;
}): ReactNode {
  const [providers, setProviders] = useState<ProviderIntegration[]>([]);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const refresh = async (): Promise<void> => {
    if (!workspace) return;
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await window.openshell.providerIntegrations(workspace);
      if (request === requestRef.current) setProviders(next);
    } catch (cause) {
      if (request === requestRef.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    requestRef.current += 1;
    setProviders([]);
    setError(null);
    if (!workspace) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [workspace?.id, workspace?.generation]);

  const visible = useMemo(() => {
    const rank = new Map<string, number>(POPULAR_PROVIDER_IDS.map((id, index) => [id, index]));
    const normalized = query.trim().toLowerCase();
    return providers
      .filter((provider) => normalized
        ? providerName(provider).toLowerCase().includes(normalized) || provider.id.toLowerCase().includes(normalized)
        : showAll || rank.has(provider.id) || provider.credentials.length > 0 || provider.environment.connected.length > 0)
      .sort((a, b) => (rank.get(a.id) ?? 1000) - (rank.get(b.id) ?? 1000) || a.name.localeCompare(b.name));
  }, [providers, query, showAll]);
  const usageByProvider = new Map(usage.map((item) => [item.provider, item]));

  if (!workspace) return <div className="settings-empty">Open a workspace to connect model providers.</div>;

  return (
    <div className="provider-settings">
      <div className="provider-toolbar">
        <div><strong>Bring your own provider</strong><small>Keys are stored by the active agent runtime and are never displayed again.</small></div>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search providers" aria-label="Search providers" />
      </div>
      {error && <div className="settings-callout provider-error"><strong>Providers unavailable</strong><p>{error}</p></div>}
      {loading && providers.length === 0 ? <div className="settings-empty">Loading provider catalog...</div> : <div className="provider-grid">
        {visible.map((provider) => <ProviderCard key={provider.id} provider={provider} usage={usageByProvider.get(provider.id)} workspace={workspace} refresh={refresh} refreshModels={refreshModels} />)}
      </div>}
      {!query && providers.length > visible.length && <button className="provider-show-all" onClick={() => setShowAll((current) => !current)}>{showAll ? "Show featured providers" : `Browse all ${providers.length} providers`}</button>}
      {!loading && visible.length === 0 && <div className="settings-empty">No providers match your search.</div>}
    </div>
  );
}
