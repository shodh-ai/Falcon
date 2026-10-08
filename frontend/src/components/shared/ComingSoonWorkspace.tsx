import Link from 'next/link';
import { ArrowLeft, Clock3, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type ComingSoonWorkspaceProps = {
  title: string;
  description: string;
  backHref: string;
};

export function ComingSoonWorkspace({ title, description, backHref }: ComingSoonWorkspaceProps) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center p-4">
      <Card className="w-full overflow-hidden border-sgvu-navy/10 shadow-sm">
        <CardContent className="flex flex-col items-center px-6 py-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sgvu-gold/15 text-sgvu-navy">
            <Sparkles className="h-8 w-8" />
          </div>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" /> Coming soon
          </div>
          <h1 className="mt-4 text-2xl font-bold text-sgvu-navy md:text-3xl">{title}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">{description}</p>
          <Button asChild variant="outline" className="mt-7">
            <Link href={backHref}><ArrowLeft className="mr-2 h-4 w-4" />Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
