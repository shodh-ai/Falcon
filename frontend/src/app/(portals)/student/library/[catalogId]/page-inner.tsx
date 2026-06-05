'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import { ArrowLeft, BookOpen, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { useAuthedApi } from '@/lib/api';

type CatalogDetail = {
  catalog_id: string;
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  category: string;
  synopsis: string;
  cover_image_url: string | null;
  total_copies: number;
  available_copies: number;
  primary_shelf: string;
  copies: Array<{ accession_number: string; shelf_location: string; status: string }>;
};

export default function StudentLibraryBookPage({ catalogId }: { catalogId: string }) {
  const api = useAuthedApi();
  const [book, setBook] = useState<CatalogDetail | null>(null);

  useEffect(() => {
    void api.get<CatalogDetail>(`/api/library/catalog/${catalogId}`).then(setBook);
  }, [api, catalogId]);

  async function placeHold() {
    try {
      await api.post('/api/library/reservations', { catalog_id: catalogId });
      toast.success('Hold placed — we will notify you when ready for pickup');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not place hold');
    }
  }

  if (!book) {
    return <StudentLoadingState label="Loading book details…" />;
  }

  return (
    <StudentPageShell width="5xl">
      <Link
        href="/student/library"
        className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-white px-3 py-2 text-sm font-semibold text-sgvu-navy transition hover:border-sgvu-gold/50"
      >
        <ArrowLeft className="h-4 w-4" /> Back to catalog
      </Link>

      <section className="overflow-hidden rounded-[1.75rem] border border-sgvu-navy/10 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="relative mx-auto h-56 w-40 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-muted shadow-lg sm:mx-0">
            {book.cover_image_url ? (
              <Image src={book.cover_image_url} alt={book.title} fill className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full flex-col justify-between bg-gradient-to-br from-sgvu-navy to-slate-800 p-4">
                <BookOpen className="h-6 w-6 text-sgvu-gold" />
                <p className="text-xs font-semibold text-white/90">{book.title}</p>
              </div>
            )}
          </div>
          <div className="flex-1 space-y-3">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-sgvu-gold">{book.category}</p>
            <h1 className="text-2xl font-black text-sgvu-navy sm:text-3xl">{book.title}</h1>
            <p className="text-muted-foreground">{book.author}</p>
            <p className="text-sm">
              ISBN {book.isbn} · {book.publisher}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant={book.available_copies > 0 ? 'success' : 'destructive'}>
                {book.available_copies}/{book.total_copies} available
              </Badge>
              {book.primary_shelf && <Badge variant="outline">Shelf: {book.primary_shelf}</Badge>}
            </div>
            {book.available_copies === 0 ? (
              <Button className="mt-2 bg-sgvu-navy" onClick={() => void placeHold()}>
                Place hold
              </Button>
            ) : (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm font-medium text-emerald-800">
                Available now — visit the circulation desk with your ID to borrow.
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <StudentStatCard label="Total copies" value={book.total_copies} helper="In library catalog" icon={BookOpen} />
        <StudentStatCard
          label="Available now"
          value={book.available_copies}
          helper={book.available_copies > 0 ? 'Ready to borrow' : 'Place a hold to queue'}
          tone={book.available_copies > 0 ? 'success' : 'warning'}
          icon={MapPin}
        />
      </div>

      {book.synopsis && (
        <StudentSectionCard title="Synopsis" description="About this title" icon={BookOpen}>
          <p className="text-sm leading-relaxed text-muted-foreground">{book.synopsis}</p>
        </StudentSectionCard>
      )}

      <StudentSectionCard title="Copy locations" description="Accession numbers and shelf positions" icon={MapPin}>
        <div className="space-y-2 text-sm">
          {book.copies.map((c) => (
            <div key={c.accession_number} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-white px-3 py-2">
              <span className="font-mono text-xs text-muted-foreground">{c.accession_number}</span>
              <span>{c.shelf_location}</span>
              <Badge variant="outline">{c.status}</Badge>
            </div>
          ))}
        </div>
      </StudentSectionCard>
    </StudentPageShell>
  );
}
