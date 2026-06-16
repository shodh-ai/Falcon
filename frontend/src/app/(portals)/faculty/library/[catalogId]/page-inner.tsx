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
import { FacultyPageShell, FacultyPageLoading } from '@/components/faculty';

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

export default function FacultyLibraryBookPage({ catalogId }: { catalogId: string }) {
  const api = useAuthedApi();
  const [book, setBook] = useState<CatalogDetail | null>(null);

  useEffect(() => {
    void api.get<CatalogDetail>(`/api/library/catalog/${catalogId}`).then(setBook);
  }, [api, catalogId]);

  async function placeHold() {
    try {
      await api.post('/api/library/reservations', { catalog_id: catalogId });
      toast.success('Hold placed — you will be notified when ready for pickup');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not place hold');
    }
  }

  if (!book) return <FacultyPageLoading label="Loading book details…" branded />;

  return (
    <FacultyPageShell>
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
          <h1 className="text-2xl font-bold text-sgvu-navy">{book.title}</h1>
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
