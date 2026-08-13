import type { ToolContentView } from "./types";

export const MAX_RETAINED_OUTPUT_CHARS = 8 * 1024;
export const MAX_INACTIVE_SESSION_RECORDS = 4;

export function retainOutput(value: string): string {
  if (value.length <= MAX_RETAINED_OUTPUT_CHARS) return value;
  let omitted = value.length - MAX_RETAINED_OUTPUT_CHARS;
  let marker = "";
  while (true) {
    marker = `\n... ${omitted} characters omitted ...\n`;
    const actual = value.length - (MAX_RETAINED_OUTPUT_CHARS - marker.length);
    if (actual === omitted) break;
    omitted = actual;
  }
  const retained = MAX_RETAINED_OUTPUT_CHARS - marker.length;
  const head = Math.ceil(retained / 2);
  return value.slice(0, head) + marker + value.slice(value.length - (retained - head));
}

export function retainMatchingSessionRecords<T>(
  records: Record<string, T>,
  retained: Record<string, unknown>,
  activeSessionID?: string
): Record<string, T> {
  const entries = Object.entries(records).filter(([id]) => id === activeSessionID || id in retained);
  return entries.length === Object.keys(records).length ? records : Object.fromEntries(entries);
}

export function retainToolContent(content: ToolContentView[] | undefined): ToolContentView[] | undefined {
  const files = content?.filter((item) => item.type === "file");
  return files?.length ? files : undefined;
}

export function retainSessionRecord<T>(
  records: Record<string, T>,
  sessionID: string,
  value: T,
  protectedIDs?: string | ReadonlySet<string>
): Record<string, T> {
  const next = { ...records };
  delete next[sessionID];
  next[sessionID] = value;
  const protectedSet = protectedIDs instanceof Set
    ? protectedIDs
    : new Set(protectedIDs ? [protectedIDs] : []);
  const inactive = Object.keys(next).filter((id) => !protectedSet.has(id));
  for (const id of inactive.slice(0, -MAX_INACTIVE_SESSION_RECORDS)) delete next[id];
  return next;
}
