const LOCAL_API = 'http://localhost:4000';

declare global {
  interface Window {
    __FALCON_API_URL?: string;
  }
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function isLocalhostUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function readEnvApiUrl(): string | undefined {
  const fromPublic = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromPublic) return trimTrailingSlash(fromPublic);

  const fromServer = process.env.API_URL?.trim();
  if (fromServer) return trimTrailingSlash(fromServer);

  return undefined;
}

function readRuntimeApiUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const injected = window.__FALCON_API_URL?.trim();
  return injected ? trimTrailingSlash(injected) : undefined;
}

function isBrowserLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

/** Server-side resolution (SSR / RSC). Uses runtime `API_URL` or build-time `NEXT_PUBLIC_API_URL`. */
export function getServerApiBaseUrl(): string {
  return readEnvApiUrl() ?? LOCAL_API;
}

/**
 * Resolves the Falcon backend origin (no trailing slash).
 * Prefers runtime injection (Coolify `API_URL`), then build-time `NEXT_PUBLIC_API_URL`.
 * Never returns localhost when the page is served from a non-local host.
 */
export function getApiBaseUrl(): string {
  const runtime = readRuntimeApiUrl();
  if (runtime && !isLocalhostUrl(runtime)) return runtime;

  const env = readEnvApiUrl();
  if (env && !isLocalhostUrl(env)) return env;

  if (isBrowserLocalhost()) {
    return env ?? runtime ?? LOCAL_API;
  }

  if (runtime && isLocalhostUrl(runtime)) {
    // Misconfigured injection — ignore and fall through.
  }

  if (env && isLocalhostUrl(env)) {
    // Build baked localhost on prod — ignore.
  }

  throw new Error(
    'API URL is not configured. Set API_URL (runtime) or NEXT_PUBLIC_API_URL (build) in Coolify to your backend URL.',
  );
}

/** Use in template literals: `${apiUrlRef}/path` resolves at call time. */
export const apiUrlRef = {
  toString() {
    return getApiBaseUrl();
  },
  valueOf() {
    return getApiBaseUrl();
  },
} as unknown as string;
