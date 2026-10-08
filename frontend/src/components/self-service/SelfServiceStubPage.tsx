import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

type Props = {
  title: string;
  description: string;
  children: ReactNode;
};

export function SelfServiceStubPage({ title, description, children }: Props) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <CardContent className="p-6">
          <section>
            <h2 className="text-2xl font-bold text-sgvu-navy">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </section>
        </CardContent>
      </Card>
      {children}
    </div>
  );
}
