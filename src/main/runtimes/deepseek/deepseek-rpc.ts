import { randomUUID } from "node:crypto";

const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;

interface RpcSuccess<T> {
  ok: true;
  value: T;
}

interface RpcFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details: unknown;
  };
}

interface ServerResponse<T> {
  type: "server-response";
  rpcId: string;
  result: RpcSuccess<T> | RpcFailure;
}

interface ServerRequest<T> {
  type: "server-request";
  rpcId: string;
  method: string;
  payload: T;
}

export class DeepSeekRpcError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: unknown
  ) {
    super(message);
    this.name = "DeepSeekRpcError";
  }
}

function loopback(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "[::1]" || hostname === "::1") return true;
  const octets = hostname.split(".");
  return octets.length === 4 && octets[0] === "127" && octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

export function deepSeekBaseUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" || !loopback(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw new Error("DeepSeek Harness URL must be an unauthenticated loopback HTTP URL");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  return url;
}

async function boundedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error("DeepSeek Harness response is too large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("DeepSeek Harness response is too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseResponse<T>(value: unknown, rpcId: string): ServerResponse<T> {
  if (!object(value) || value.type !== "server-response" || value.rpcId !== rpcId || !object(value.result)) {
    throw new Error("DeepSeek Harness returned an invalid or mismatched RPC response");
  }
  if (value.result.ok === true && "value" in value.result) return value as unknown as ServerResponse<T>;
  const error = value.result.error;
  if (value.result.ok !== false || !object(error) || typeof error.code !== "string" || typeof error.message !== "string") {
    throw new Error("DeepSeek Harness returned an invalid RPC result");
  }
  return value as unknown as ServerResponse<T>;
}

export class DeepSeekRpcClient {
  readonly baseUrl: URL;

  constructor(baseUrl: string, private readonly fetcher: typeof fetch = fetch) {
    this.baseUrl = deepSeekBaseUrl(baseUrl);
  }

  async call<T>(method: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    if (!/^[a-z][a-z0-9-]*\.[A-Za-z][A-Za-z0-9]*$/.test(method)) throw new Error("Invalid DeepSeek Harness RPC method");
    const rpcId = randomUUID();
    const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await this.fetcher(new URL(`/api/${method}`, this.baseUrl), {
      method: "POST",
      redirect: "manual",
      signal: combined,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        host: this.baseUrl.host
      },
      body: JSON.stringify({ type: "client-request", rpcId, method, payload })
    });
    if (response.status >= 300 && response.status < 400) throw new Error("DeepSeek Harness refused an RPC redirect");
    if (!response.ok) throw new Error(`DeepSeek Harness RPC failed with HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") throw new Error("DeepSeek Harness RPC returned non-JSON content");
    const text = await boundedText(response);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("DeepSeek Harness RPC returned malformed JSON");
    }
    const envelope = parseResponse<T>(parsed, rpcId);
    if (!envelope.result.ok) throw new DeepSeekRpcError(envelope.result.error.code, envelope.result.error.message, envelope.result.error.details);
    return envelope.result.value;
  }

  async *events<T>(stream: "mux" | "host", signal: AbortSignal): AsyncIterable<ServerRequest<T>> {
    const response = await this.fetcher(new URL(`/api/events.${stream}`, this.baseUrl), {
      method: "GET",
      redirect: "manual",
      signal,
      headers: { accept: "text/event-stream", host: this.baseUrl.host }
    });
    if (response.status >= 300 && response.status < 400) throw new Error("DeepSeek Harness refused an event-stream redirect");
    if (!response.ok) throw new Error(`DeepSeek Harness event stream failed with HTTP ${response.status}`);
    if (response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "text/event-stream") {
      throw new Error("DeepSeek Harness event stream returned unexpected content");
    }
    if (!response.body) throw new Error("DeepSeek Harness event stream returned no body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (data) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            throw new Error("DeepSeek Harness event stream returned malformed JSON");
          }
          if (!object(parsed) || parsed.type !== "server-request" || typeof parsed.rpcId !== "string" || typeof parsed.method !== "string" || !("payload" in parsed)) {
            throw new Error("DeepSeek Harness event stream returned an invalid frame");
          }
          yield parsed as unknown as ServerRequest<T>;
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (buffer.length > MAX_RESPONSE_BYTES) throw new Error("DeepSeek Harness event frame is too large");
    }
  }
}
