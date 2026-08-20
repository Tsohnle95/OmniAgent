import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProviderUsage, readOAuthEntries } from "./provider-usage";
import { sqliteQuery } from "./sqlite";

vi.mock("./sqlite", () => ({ sqliteQuery: vi.fn() }));

const sqliteQueryMock = sqliteQuery as unknown as ReturnType<typeof vi.fn>;

function mockDbRows(accounts: unknown[], credentials: unknown[]): void {
  sqliteQueryMock.mockImplementation((_db: string, sql: string) => {
    const rows = sql.includes("FROM account") ? accounts : sql.includes("FROM credential") ? credentials : [];
    return Promise.resolve(rows);
  });
}

function mockGoUsage(): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ usage: {} }), { status: 200 })));
}

describe("provider usage from opencode store", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the opencode-go subscription from opencode.db", async () => {
    const goCredential = {
      integration_id: "opencode-go",
      value: JSON.stringify({ type: "key", key: "go-token-123" }),
      active: null
    };
    mockDbRows([], [goCredential]);
    mockGoUsage();

    const entries = await readOAuthEntries();
    expect(entries["opencode-go"]).toEqual({ type: "oauth", access: "go-token-123" });

    const results = await fetchProviderUsage();
    const go = results.find((result) => result.provider === "opencode-go");
    expect(go).toBeDefined();
    expect(go!.status).toBe("ok");
    expect(go!.snapshot?.planType).toBe("go");
    expect(go!.snapshot?.windows).toEqual([]);
  });

  it("reports the opencode-go subscription from a legacy plain-string credential", async () => {
    mockDbRows([], [{ integration_id: "opencode-go", value: "legacy-token", active: 1 }]);
    mockGoUsage();

    const results = await fetchProviderUsage();
    const go = results.find((result) => result.provider === "opencode-go");
    expect(go).toBeDefined();
    expect(go!.status).toBe("ok");
    expect(go!.snapshot?.planType).toBe("go");
  });

  it("shows OpenCode Go rolling, weekly, and monthly usage", async () => {
    mockDbRows([], [{ integration_id: "opencode-go", value: "go-token", active: 1 }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      usage: {
        rolling: { percent: 12, resetsAt: "2026-08-20T12:00:00.000Z" },
        weekly: { percent: 100, resetsAt: "2026-08-24T12:00:00.000Z" },
        monthly: { percent: 45, resetsAt: "2026-09-01T12:00:00.000Z" }
      }
    }), { status: 200 })));

    const go = (await fetchProviderUsage()).find((result) => result.provider === "opencode-go");
    expect(go?.snapshot?.windows.map((window) => [window.label, window.usedPercent])).toEqual([
      ["Rolling", 12], ["Weekly", 100], ["Monthly", 45]
    ]);
  });

  it("does not report opencode-go when the subscription credential is absent", async () => {
    mockDbRows([], [{ integration_id: "something-else", value: JSON.stringify({ type: "key", key: "x" }) }]);

    const results = await fetchProviderUsage();
    expect(results.find((result) => result.provider === "opencode-go")).toBeUndefined();
  });

  it("still maps legacy openai/anthropic/github OAuth accounts from the account table", async () => {
    mockDbRows(
      [
        { url: "https://chatgpt.com", access_token: "a", refresh_token: "r", token_expiry: 0 },
        { url: "https://api.anthropic.com", access_token: "b", refresh_token: "r2", token_expiry: 0 },
        { url: "https://github.com", access_token: "c", refresh_token: "r3", token_expiry: 0 }
      ],
      []
    );

    const entries = await readOAuthEntries();
    expect(entries.openai?.access).toBe("a");
    expect(entries.anthropic?.access).toBe("b");
    expect(entries["github-copilot"]?.access).toBe("c");
  });

  it("maps the current OpenAI OAuth credential from the credential table", async () => {
    mockDbRows([], [{ integration_id: "openai", value: JSON.stringify({ type: "oauth", access: "a", refresh: "r", expires: 0 }), active: 1 }]);

    const entries = await readOAuthEntries();
    expect(entries.openai).toEqual({ type: "oauth", access: "a", refresh: "r", expires: 0 });
  });

  it("returns no provider usage when opencode.db has no credentials", async () => {
    mockDbRows([], []);
    const results = await fetchProviderUsage();
    expect(results).toEqual([]);
  });
});
