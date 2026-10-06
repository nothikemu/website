/** Human-readable references for engineering artifacts. Shared by server and client. */
export const REF_PREFIX = {
  requirement: "REQ",
  test: "TEST",
  decision: "DEC",
  change: "CHANGE",
  issue: "ISS",
  task: "TASK",
  notebook_entry: "NB",
} as const;

export type RefKind = keyof typeof REF_PREFIX;

export const PREFIX_TO_KIND: Record<string, RefKind> = Object.fromEntries(
  Object.entries(REF_PREFIX).map(([k, v]) => [v, k as RefKind]),
) as Record<string, RefKind>;

export function formatRef(kind: RefKind, n: number): string {
  return `${REF_PREFIX[kind]}-${String(n).padStart(3, "0")}`;
}

export const REF_PATTERN = /\b(REQ|TEST|DEC|CHANGE|ISS|TASK|NB)-(\d{1,6})\b/g;

export function parseRefs(text: string | null | undefined): { kind: RefKind; number: number; raw: string }[] {
  if (!text) return [];
  const out = new Map<string, { kind: RefKind; number: number; raw: string }>();
  for (const m of text.matchAll(REF_PATTERN)) {
    const kind = PREFIX_TO_KIND[m[1]!];
    if (kind) out.set(`${kind}:${Number(m[2])}`, { kind, number: Number(m[2]), raw: m[0] });
  }
  return [...out.values()];
}

export const KIND_PATH: Record<RefKind, string> = {
  requirement: "requirements",
  test: "tests",
  decision: "decisions",
  change: "changes",
  issue: "issues",
  task: "tasks",
  notebook_entry: "notebook",
};

export function refUrl(projectSlug: string, kind: RefKind, n: number) {
  return `/project/${projectSlug}/${KIND_PATH[kind]}/${n}`;
}
