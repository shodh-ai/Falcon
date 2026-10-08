import { notFound } from 'next/navigation';

/** Unknown /president/* paths should 404 — do not silently show Executive Summary. */
export default function PresidentUnknownSlugPage() {
  notFound();
}
