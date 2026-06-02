'use client';

import { useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import type { LmsModule } from '@/lib/api/lms';
import { downloadWithAuth } from '@/lib/api/lms';

type Props = {
  modules: LmsModule[];
};

export function StudentMaterialsTab({ modules }: Props) {
  const { token } = useAuth();
  const [openId, setOpenId] = useState<string | null>(modules[0]?.module_id ?? null);

  if (!modules.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Faculty has not published course materials yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {modules.map((mod) => {
        const expanded = openId === mod.module_id;
        return (
          <Card key={mod.module_id}>
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left"
              onClick={() => setOpenId(expanded ? null : mod.module_id)}
            >
              <span className="font-medium">
                Unit {mod.module_number}: {mod.title}
              </span>
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
            </button>
            {expanded && (
              <CardContent className="space-y-2 border-t pt-2 pb-4">
                {mod.materials.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No files in this unit yet.</p>
                ) : (
                  mod.materials.map((m) => (
                    <div
                      key={m.material_id}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <FileText className="h-4 w-4 text-sgvu-navy" />
                        <span>{m.title}</span>
                        <span className="text-xs text-muted-foreground">({m.material_type})</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!token}
                        onClick={() =>
                          void downloadWithAuth(
                            `/api/academics/student/courses/materials/${m.material_id}/download`,
                            token!,
                            m.title,
                          )
                        }
                      >
                        Download
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
