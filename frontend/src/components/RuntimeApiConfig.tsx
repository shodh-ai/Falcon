import Script from 'next/script';

/**
 * Injects backend URL at runtime so Coolify can set API_URL without rebuilding.
 * `beforeInteractive` runs before any app JS on the client.
 */
export function RuntimeApiConfig() {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.API_URL?.trim() ||
    '';

  return (
    <Script id="falcon-api-url" strategy="beforeInteractive">
      {`window.__FALCON_API_URL=${JSON.stringify(apiUrl)};`}
    </Script>
  );
}
