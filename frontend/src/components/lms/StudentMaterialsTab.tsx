'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import type { LmsMaterial, LmsModule } from '@/lib/api/lms';
import { downloadWithAuth } from '@/lib/api/lms';

type Props = {
  modules: LmsModule[];
  syllabusMaterials?: LmsMaterial[];
};

function DownloadRow({
  material,
  token,
  compact,
}: {
  material: LmsMaterial;
  token: string | null;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2',
        compact && 'sm:max-w-md',
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <FileText className="h-4 w-4 shrink-0 text-sgvu-navy" />
        <span className="truncate font-medium">{material.title}</span>
        {!compact ? (
          <span className="shrink-0 text-xs text-muted-foreground">({material.material_type})</span>
        ) : null}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        disabled={!token}
        onClick={() =>
          void downloadWithAuth(
            `/api/academics/student/courses/materials/${material.material_id}/download`,
            token!,
            material.title,
          )
        }
      >
        Download
      </Button>
    </div>
  );
}

export function StudentMaterialsTab({ modules, syllabusMaterials = [] }: Props) {
  const { token } = useAuth();
  const [openId, setOpenId] = useState<string | null>(modules[0]?.module_id ?? null);

  if (!modules.length && syllabusMaterials.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Faculty has not published course materials yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-xl border border-sgvu-gold/35 bg-gradient-to-br from-sgvu-gold/12 via-sgvu-gold/5 to-background">
        <div className="flex flex-col gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sgvu-gold/25 text-sgvu-navy">
                <BookOpen className="h-5 w-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-sgvu-navy">Course Syllabus</h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {syllabusMaterials.length} file{syllabusMaterials.length === 1 ? '' : 's'}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Lesson plan and syllabus — download before starting units
                </p>
              </div>
            </div>
          </div>

          {syllabusMaterials.length === 0 ? (
            <p className="rounded-lg border border-dashed border-sgvu-gold/30 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
              Syllabus not uploaded yet. Check back once faculty publishes it.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {syllabusMaterials.map((m) => (
                <DownloadRow key={m.material_id} material={m} token={token} compact />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2 border-b border-border/60 pb-2">
          <span className="h-4 w-1 rounded-full bg-sgvu-navy" />
          <div>
            <h3 className="text-sm font-bold text-sgvu-navy">Unit notes & materials</h3>
            <p className="text-xs text-muted-foreground">
              {modules.length} unit{modules.length === 1 ? '' : 's'} · expand to download notes and slides
            </p>
          </div>
        </div>

        {modules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No unit notes published yet.</p>
        ) : (
          <div className="space-y-2">
            {modules.map((mod) => {
              const expanded = openId === mod.module_id;
              return (
                <Card key={mod.module_id} className="overflow-hidden shadow-sm">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-muted/30"
                    onClick={() => setOpenId(expanded ? null : mod.module_id)}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 rounded-md bg-sgvu-navy/10 px-2 py-0.5 text-xs font-bold text-sgvu-navy">
                        Unit {mod.module_number}
                      </span>
                      <span className="truncate font-medium text-sgvu-navy">{mod.title}</span>
                      {mod.materials.length > 0 ? (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {mod.materials.length} file{mod.materials.length === 1 ? '' : 's'}
                        </Badge>
                      ) : null}
                    </div>
                    <ChevronDown
                      className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
                    />
                  </button>
                  {expanded && (
                    <CardContent className="space-y-2 border-t bg-muted/10 pt-3 pb-4">
                      {mod.materials.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No files in this unit yet.</p>
                      ) : (
                        mod.materials.map((m) => (
                          <DownloadRow key={m.material_id} material={m} token={token} />
                        ))
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
