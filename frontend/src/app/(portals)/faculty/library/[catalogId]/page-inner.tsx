'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from '@/lib/notifications/falcon-toast';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPageLoading,
  FacultyEmptyState,
} from '@/components/faculty';
import { isFacultyDemoSmokeId, withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import { facultyDemoLibraryCatalog } from '@/lib/mock/faculty-portal-demo-modules';

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

function demoCatalogDetail(catalogId: string): CatalogDetail | null {
  const row = facultyDemoLibraryCatalog().find((c) => c.catalog_id === catalogId);
  if (!row) return null;
  return {
    catalog_id: row.catalog_id,
    title: row.title,
    author: row.author,
    isbn: row.isbn,
    publisher: 'Academic Press',
    category: row.category,
    synopsis:
      'Faculty OPAC preview of this title. Availability and shelf details are shown for smoke testing when the live catalog API is unavailable.',
    cover_image_url: row.cover_image_url,
    total_copies: row.total_copies,
    available_copies: row.available_copies,
    primary_shelf: 'CSE-Stack-A',
    copies: Array.from({ length: Math.min(row.total_copies, 3) }, (_, i) => ({
      accession_number: `${row.catalog_id.toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
      shelf_location: 'CSE-Stack-A',
      status: i < row.available_copies ? 'AVAILABLE' : 'ON_LOAN',
    })),
  };
}

export default function FacultyLibraryBookPage({ catalogId }: { catalogId: string }) {
  const api = useAuthedApi();
  const [book, setBook] = useState<CatalogDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void api
      .get<CatalogDetail>(`/api/library/catalog/${catalogId}`)
      .then((data) => {
        setBook(withFacultyDemoFallback(data, demoCatalogDetail(catalogId), (v) => !v?.catalog_id));
      })
      .catch(() => {
        setBook(withFacultyDemoFallback(null, demoCatalogDetail(catalogId)));
      })
      .finally(() => setLoading(false));
  }, [api, catalogId]);

  async function placeHold() {
    if (isFacultyDemoSmokeId(catalogId)) {
      toast.success('Hold recorded locally (demo catalog title)');
      return;
    }
    try {
      await api.post('/api/library/reservations', { catalog_id: catalogId });
      toast.success('Hold placed — you will be notified when ready for pickup');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not place hold');
    }
  }

  if (loading) return <FacultyPageLoading label="Loading book details…" branded />;
  if (!book) {
    return (
      <FacultyPageShell>
        <FacultyPageHeader title="Library OPAC" description="Catalog title details." />
        <FacultyEmptyState
          title="Title not found"
          description="This catalog entry could not be loaded."
        />
        <Link href="/faculty/library" className="inline-flex items-center gap-1 text-sm text-sgvu-navy hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to OPAC
        </Link>
      </FacultyPageShell>
    );
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Library OPAC"
        description="Catalog title details, availability, and hold requests."
      />
      <Link href="/faculty/library" className="inline-flex items-center gap-1 text-sm text-sgvu-navy hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to OPAC
      </Link>

      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="relative mx-auto h-56 w-40 shrink-0 overflow-hidden rounded-lg bg-muted shadow-md sm:mx-0">
          {book.cover_image_url ? (
            <Image src={book.cover_image_url} alt={book.title} fill className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No cover</div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <h2 className="text-2xl font-bold text-sgvu-navy">{book.title}</h2>
          <p className="text-muted-foreground">{book.author}</p>
          <p className="text-sm">
            ISBN {book.isbn} · {book.publisher} · {book.category}
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant={book.available_copies > 0 ? 'default' : 'destructive'}>
              Total: {book.total_copies} | Available: {book.available_copies}
            </Badge>
            {book.primary_shelf && <Badge variant="outline">Shelf: {book.primary_shelf}</Badge>}
          </div>
          {book.available_copies === 0 ? (
            <Button className="mt-4 bg-sgvu-navy" onClick={() => void placeHold()}>
              Place hold
            </Button>
          ) : (
            <p className="mt-4 text-sm font-medium text-emerald-700">
              Available — scan your faculty ID at the circulation desk to borrow (180-day loan).
            </p>
          )}
        </div>
      </div>

      {book.synopsis && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Synopsis</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">{book.synopsis}</CardContent>
        </Card>
      )}
    </FacultyPageShell>
  );
}
