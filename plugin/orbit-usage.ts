import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { Plugin } from "@opencode-ai/plugin"

type UsageWindow = {
  id: string
  label: string
  usedPercent: number
  windowMinutes: number | null
  resetsAt: number | null
}

type UsageResult = {
  provider: string
  displayName: string
  status: "ok" | "unavailable"
  snapshot: { windows: UsageWindow[]; credits: null; planType: string | null; updatedAt: number } | null
  error: { code: string; message: string; retryable: boolean } | null
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000

function snapshotPath(): string {
  if (process.env.ORBIT_USAGE_SNAPSHOT) return process.env.ORBIT_USAGE_SNAPSHOT
  const data = process.env.XDG_DATA_HOME ?? path.join(homedir(), ".local", "share")
  return path.join(data, "opencode", "orbit-usage.json")
}

async function resolvedToken(ctx, integrationID): Promise<string | null> {
  try {
    const connection = await ctx.integration.connection.active(integrationID)
    if (!connection) return null
    const credential = await ctx.integration.connection.resolve(connection)
    return credential && typeof credential.access === "string" ? credential.access : typeof credential?.key === "string" ? credential.key : null
  } catch {
    return null
  }
}

async function chatgptUsage(token: string): Promise<UsageResult> {
  const base: UsageResult = { provider: "openai", displayName: "ChatGPT", status: "ok", snapshot: null, error: null }
  try {
    const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      headers: { authorization: `Bearer ${token}`, "chatgpt-account-id": "" },
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) return { ...base, status: "unavailable", error: { code: "http", message: `HTTP ${response.status}`, retryable: response.status >= 500 } }
    const raw = await response.json() as Record<string, unknown>
    const limits = raw?.usage ?? raw
    const windows: UsageWindow[] = []
    const read = (key: string, id: string, label: string, minutes: number | null) => {
      const record = limits?.[key] as Record<string, number> | undefined
      const percent = Number(record?.percent)
      if (!Number.isFinite(percent)) return
      windows.push({ id, label, usedPercent: Math.min(100, Math.max(0, percent)), windowMinutes: minutes, resetsAt: null })
    }
    read("primary_window", "primary", "Primary window", 5 * 60)
    read("secondary_window", "secondary", "Secondary window", 24 * 60)
    read("tertiary_window", "tertiary", "Tertiary window", 24 * 60 * 7)
    return { ...base, snapshot: { windows, credits: null, planType: null, updatedAt: Date.now() } }
  } catch (cause) {
    return { ...base, status: "unavailable", error: { code: "network", message: cause instanceof Error ? cause.message : String(cause), retryable: true } }
  }
}

async function claudeUsage(token: string): Promise<UsageResult> {
  const base: UsageResult = { provider: "anthropic", displayName: "Claude", status: "ok", snapshot: null, error: null }
  try {
    const response = await fetch("https://api.anthropic.com/v1/organizations/usage_report/messages?starting_period_days=7&limit=1", {
      headers: { authorization: `Bearer ${token}`, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) return { ...base, status: "unavailable", error: { code: "http", message: `HTTP ${response.status}`, retryable: response.status >= 500 } }
    const raw = await response.json() as { data?: Array<Record<string, unknown>> }
    const entry = raw.data?.[0]
    const fiveHour = Number(entry?.five_hour?.utilization)
    const sevenDay = Number(entry?.seven_day?.utilization)
    const windows: UsageWindow[] = []
    if (Number.isFinite(fiveHour)) windows.push({ id: "primary", label: "Five hour window", usedPercent: Math.min(100, Math.max(0, fiveHour)), windowMinutes: 5 * 60, resetsAt: null })
    if (Number.isFinite(sevenDay)) windows.push({ id: "secondary", label: "Seven day window", usedPercent: Math.min(100, Math.max(0, sevenDay)), windowMinutes: 24 * 60 * 7, resetsAt: null })
    return { ...base, snapshot: { windows, credits: null, planType: null, updatedAt: Date.now() } }
  } catch (cause) {
    return { ...base, status: "unavailable", error: { code: "network", message: cause instanceof Error ? cause.message : String(cause), retryable: true } }
  }
}

export default Plugin.define({
  id: "orbit-usage",
  async setup(ctx) {
    let running = false
    const collect = async (): Promise<void> => {
      if (running) return
      running = true
      try {
        const results: UsageResult[] = []
        const chatgpt = await resolvedToken(ctx, "openai")
        if (chatgpt) results.push(await chatgptUsage(chatgpt))
        const anthropic = await resolvedToken(ctx, "anthropic")
        if (anthropic) results.push(await claudeUsage(anthropic))
        if (results.length > 0) {
          await fs.mkdir(path.dirname(snapshotPath()), { recursive: true })
          await fs.writeFile(snapshotPath(), JSON.stringify({ generatedAt: Date.now(), results }))
        }
      } catch {
      } finally {
        running = false
      }
    }
    void collect()
    const timer = setInterval(() => void collect(), REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }
})
