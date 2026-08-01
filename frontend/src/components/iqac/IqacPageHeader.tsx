import { Card, CardContent } from '@/components/ui/card';

export function IqacPageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <Card className="border-sgvu-navy/10 bg-white shadow-sm">
      <CardContent className="p-5 md:p-6">
        <h1 className="text-2xl font-bold tracking-tight text-sgvu-navy sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
