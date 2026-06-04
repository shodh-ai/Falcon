'use client';

import { useState } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type IsbnResult = {
  isbn: string;
  title: string;
  author: string;
  publisher?: string;
  category?: string;
  synopsis?: string;
  cover_image_url?: string;
  source: string;
};

export default function LibraryCatalogPage() {
  const api = useAuthedApi();
  const [isbn, setIsbn] = useState('9780132350884');
  const [fetched, setFetched] = useState<IsbnResult | null>(null);
  const [shelf, setShelf] = useState('Row 4, Rack B');
  const [accession, setAccession] = useState(`LIB-${Date.now().toString().slice(-6)}`);
  const [loading, setLoading] = useState(false);

  async function fetchIsbn() {
    setLoading(true);
    try {
      const res = await api.get<IsbnResult | null>(
        `/api/library-admin/isbn-lookup?isbn=${encodeURIComponent(isbn)}`,
      );
      if (!res) {
        toast.error('ISBN not found — try Open Library or enter manually');
        setFetched(null);
      } else {
        setFetched(res);
        toast.success(`Loaded from ${res.source}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }

  async function saveToCatalog() {
    if (!fetched) return;
    try {
      await api.post('/api/library-admin/catalog', {
        isbn: fetched.isbn,
        title: fetched.title,
        author: fetched.author,
        publisher: fetched.publisher,
        category: fetched.category,
        synopsis: fetched.synopsis,
        cover_image_url: fetched.cover_image_url,
        copies: [{ accession_number: accession, shelf_location: shelf }],
      });
      toast.success('Catalog entry + copy saved');
      setAccession(`LIB-${Date.now().toString().slice(-6)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Smart Cataloging</h1>
      <p className="text-sm text-muted-foreground">
        Scan or type ISBN — Google Books / Open Library auto-fills metadata. You only set shelf + accession barcode.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">ISBN fetcher</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              autoFocus
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              placeholder="9780132350884"
              onKeyDown={(e) => e.key === 'Enter' && void fetchIsbn()}
            />
            <Button onClick={() => void fetchIsbn()} disabled={loading}>
              {loading ? 'Fetching…' : 'Fetch'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Optional: set GOOGLE_BOOKS_API_KEY in backend .env for higher quota.
          </p>
        </CardContent>
      </Card>

      {fetched && (
        <Card className="border-sgvu-gold/40">
          <CardContent className="flex gap-4 pt-6">
            {fetched.cover_image_url && (
              <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded bg-muted">
                <Image src={fetched.cover_image_url} alt="" fill className="object-cover" unoptimized />
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-bold text-lg">{fetched.title}</p>
              <p className="text-sm">{fetched.author}</p>
              <p className="text-xs text-muted-foreground">{fetched.publisher} · {fetched.category}</p>
              <Input placeholder="Accession barcode" value={accession} onChange={(e) => setAccession(e.target.value)} />
              <Input placeholder="Shelf location" value={shelf} onChange={(e) => setShelf(e.target.value)} />
              <Button className="bg-sgvu-navy" onClick={() => void saveToCatalog()}>
                Save to catalog + print sticker
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
