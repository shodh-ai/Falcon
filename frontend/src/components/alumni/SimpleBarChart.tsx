export function SimpleBarChart({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number }[];
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-sgvu-navy">{title}</h3>
      {items.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="truncate pr-2">{item.label}</span>
            <span className="font-medium tabular-nums">{item.value}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-sgvu-navy"
              style={{ width: `${Math.round((item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SimplePieLegend({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number }[];
}) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const tones = ['bg-sgvu-navy', 'bg-[#d6b65d]', 'bg-emerald-600', 'bg-sky-600', 'bg-violet-600', 'bg-rose-500'];
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-sgvu-navy">{title}</h3>
      {items.map((item, idx) => (
        <div key={item.label} className="flex items-center gap-2 text-sm">
          <span className={`h-3 w-3 shrink-0 rounded-full ${tones[idx % tones.length]}`} />
          <span className="flex-1 truncate">{item.label}</span>
          <span className="text-muted-foreground tabular-nums">
            {item.value} ({Math.round((item.value / total) * 100)}%)
          </span>
        </div>
      ))}
    </div>
  );
}
