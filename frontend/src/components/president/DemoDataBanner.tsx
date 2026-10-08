'use client';

/** Amber banner used when a President portal page is showing demo/smoke data. */
export function DemoDataBanner({
  message = 'Showing demo data for portal testing. Live feeds will replace this when available.',
}: {
  message?: string;
}) {
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      {message}
    </p>
  );
}
