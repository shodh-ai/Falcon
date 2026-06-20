import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type IsbnLookupResult = {
  isbn: string;
  title: string;
  author: string;
  publisher?: string;
  edition?: string;
  category?: string;
  synopsis?: string;
  cover_image_url?: string;
  source: 'google_books' | 'open_library';
};

@Injectable()
export class IsbnLookupService {
  private readonly logger = new Logger(IsbnLookupService.name);

  constructor(private readonly config: ConfigService) {}

  async lookup(isbn: string): Promise<IsbnLookupResult | null> {
    const normalized = isbn.replace(/[^0-9X]/gi, '');
    if (normalized.length < 10) return null;

    const google = await this.fetchGoogleBooks(normalized);
    if (google) return google;

    return this.fetchOpenLibrary(normalized);
  }

  private async fetchGoogleBooks(
    isbn: string,
  ): Promise<IsbnLookupResult | null> {
    const apiKey = this.config.get<string>('GOOGLE_BOOKS_API_KEY');
    const url = apiKey
      ? `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&key=${apiKey}`
      : `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;

    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = (await res.json()) as {
        items?: Array<{
          volumeInfo?: {
            title?: string;
            authors?: string[];
            publisher?: string;
            description?: string;
            categories?: string[];
            imageLinks?: { thumbnail?: string; smallThumbnail?: string };
          };
        }>;
      };
      const info = data.items?.[0]?.volumeInfo;
      if (!info?.title) return null;

      return {
        isbn,
        title: info.title,
        author: (info.authors ?? ['Unknown']).join(', '),
        publisher: info.publisher,
        category: info.categories?.[0],
        synopsis: info.description?.slice(0, 2000),
        cover_image_url:
          info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail,
        source: 'google_books',
      };
    } catch (e) {
      this.logger.warn(`Google Books lookup failed: ${e}`);
      return null;
    }
  }

  private async fetchOpenLibrary(
    isbn: string,
  ): Promise<IsbnLookupResult | null> {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = (await res.json()) as Record<
        string,
        {
          title?: string;
          authors?: Array<{ name: string }>;
          publishers?: Array<{ name: string }>;
          cover?: { medium?: string };
          subjects?: Array<{ name: string }>;
        }
      >;
      const entry = data[`ISBN:${isbn}`];
      if (!entry?.title) return null;

      return {
        isbn,
        title: entry.title,
        author: (entry.authors ?? [{ name: 'Unknown' }])
          .map((a) => a.name)
          .join(', '),
        publisher: entry.publishers?.[0]?.name,
        category: entry.subjects?.[0]?.name,
        cover_image_url: entry.cover?.medium,
        source: 'open_library',
      };
    } catch (e) {
      this.logger.warn(`Open Library lookup failed: ${e}`);
      return null;
    }
  }
}
