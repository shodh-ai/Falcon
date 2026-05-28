'use client';

import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export default function StudentProfilePage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-xl">{user?.name?.charAt(0) ?? 'S'}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle>{user?.name ?? 'Student'}</CardTitle>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Enrolment ID:</span>{' '}
            <span className="font-mono font-medium">BTECH-CSE-2024-0042</span>
          </p>
          <p>
            <span className="text-muted-foreground">Program:</span> B.Tech Computer Science
          </p>
          <p className="text-xs text-muted-foreground">Digital ID card — wire to IAM when enrolment numbers are finalized.</p>
        </CardContent>
      </Card>
    </div>
  );
}
