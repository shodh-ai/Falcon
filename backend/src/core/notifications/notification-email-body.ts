const INVALID_LINK =
  'Portal notification link unavailable (LINK_CONFIGURATION)';
const hasUnsafeCharacters = (value: string): boolean =>
  [...value].some(
    (character) =>
      character.charCodeAt(0) <= 32 ||
      character.charCodeAt(0) === 127 ||
      character === '\\',
  );

/** Pure text rendering: no transport, configuration loading or network access. */
export function notificationEmailBody(
  message: string,
  actionLink: string | null | undefined,
  frontendUrl: unknown,
  mode: unknown = 'production',
): string {
  if (actionLink === undefined || actionLink === null || actionLink === '') {
    return message;
  }
  try {
    if (
      typeof frontendUrl !== 'string' ||
      typeof actionLink !== 'string' ||
      hasUnsafeCharacters(frontendUrl) ||
      hasUnsafeCharacters(actionLink)
    ) {
      throw new Error(INVALID_LINK);
    }
    const origin = new URL(frontendUrl);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(
      origin.hostname,
    );
    if (
      frontendUrl !== origin.origin ||
      origin.username ||
      origin.password ||
      (origin.protocol !== 'https:' &&
        !(mode === 'development' && loopback && origin.protocol === 'http:'))
    ) {
      throw new Error(INVALID_LINK);
    }

    // Inspect repeated encoding before URL normalization can conceal traversal
    // or reinterpret a backslash/protocol-relative target.
    let decoded = actionLink;
    let decodedPath = actionLink.split(/[?#]/, 1)[0];
    for (let depth = 0; depth < 4; depth += 1) {
      if (
        !decoded.startsWith('/') ||
        decoded.startsWith('//') ||
        hasUnsafeCharacters(decoded) ||
        decodedPath.split('/').some((part) => ['.', '..'].includes(part))
      ) {
        throw new Error(INVALID_LINK);
      }
      const next = decodeURIComponent(decoded);
      const nextPath = decodeURIComponent(decodedPath);
      if (next === decoded && nextPath === decodedPath) break;
      if (depth === 3) throw new Error(INVALID_LINK);
      decoded = next;
      decodedPath = nextPath;
    }
    const target = new URL(actionLink, origin);
    if (target.origin !== origin.origin) throw new Error(INVALID_LINK);
    return `${message}\n\nOpen Falcon: ${target.href}`;
  } catch {
    throw new Error(INVALID_LINK);
  }
}
