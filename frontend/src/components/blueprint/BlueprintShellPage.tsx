export function BlueprintShellPage({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-muted-foreground">
        Loading workspace data…
      </div>
    </div>
  );
}
