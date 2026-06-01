import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function FeatureMatrixDashboard({
  title,
  subtitle,
  features,
}: {
  title: string;
  subtitle: string;
  features: Array<{ title: string; items: string[] }>;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy sm:text-3xl">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {features.map((feature) => (
          <Card key={feature.title}>
            <CardHeader>
              <CardTitle>{feature.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {feature.items.map((item) => (
                <div key={item} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <span>{item}</span>
                  <Badge variant="secondary">Enabled</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
