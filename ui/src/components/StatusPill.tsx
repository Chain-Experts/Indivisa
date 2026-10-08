export type Tone = "neutral" | "ready" | "set" | "ok" | "bad" | "busy";

export function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}
