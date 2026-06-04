'use client';

import Link from 'next/link';
import { IndianRupee, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface FinancialDuesWidgetProps {
  totalPending: number;
  dueDate: string;
  items: { id: string; label: string; amount: number }[];
}

export function FinancialDuesWidget({ totalPending, dueDate, items }: FinancialDuesWidgetProps) {
  const formattedDue = new Date(dueDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <Card className="h-full border-amber-200/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-sgvu-gold" />
          Financial Dues
        </CardTitle>
        <CardDescription>Due by {formattedDue}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-1">
          <IndianRupee className="h-6 w-6 text-sgvu-navy" />
          <span className="text-3xl font-black text-sgvu-navy">
            {totalPending.toLocaleString('en-IN')}
          </span>
          <span className="text-sm text-muted-foreground">pending</span>
        </div>
        <Separator />
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium">₹{item.amount.toLocaleString('en-IN')}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full" variant="secondary" size="lg">
          <Link href="/student/finance">Pay Now</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
