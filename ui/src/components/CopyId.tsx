import { useState } from "react";

/**
 * A ledger identifier, shortened, that copies itself in full. Update ids and
 * party ids are what a reader most wants to take away from this page and
 * least wants to transcribe by hand.
 */
export function CopyId({ value, chars = 12, title }: { value: string; chars?: number; title?: string }) {
  const [done, setDone] = useState(false);
  const short = value.length > chars ? `${value.slice(0, chars)}…` : value;
  return (
    <button
      type="button"
      className={`copy-id${done ? " done" : ""}`}
      title={title ?? `${value} — click to copy`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          // Clipboard access can be refused (an insecure origin, a locked-down
          // browser). The id is in the title attribute either way.
        }
      }}
    >
      <code>{short}</code>
      <span className="copy-mark">{done ? "copied" : "copy"}</span>
    </button>
  );
}
