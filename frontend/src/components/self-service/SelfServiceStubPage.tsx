import type { ReactNode } from 'react';

type Props = {
  title: string;
  description: string;
  children: ReactNode;
};

export function SelfServiceStubPage({ title, description, children }: Props) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </section>
      {children}
    </div>
  );
}
