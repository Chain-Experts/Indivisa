export interface Tab {
  id: string;
  label: string;
  /** A live figure, shown as a chip; the tab bar doubles as a status line. */
  count?: number | string;
}

export function Tabs({ tabs, active, onPick }: { tabs: Tab[]; active: string; onPick: (id: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === active}
          className={`tab${t.id === active ? " on" : ""}`}
          onClick={() => onPick(t.id)}
        >
          {t.label}
          {t.count !== undefined ? <span className="tab-count">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
