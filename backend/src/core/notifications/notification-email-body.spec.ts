import { notificationEmailBody } from './notification-email-body';

describe('notificationEmailBody (offline)', () => {
  const message = 'Please review your notification in Falcon.';
  const origin = 'https://falcon.example.test';

  it('adds a same-origin absolute portal link to the original message', () => {
    expect(
      notificationEmailBody(
        message,
        '/faculty/notifications?tab=unread',
        origin,
      ),
    ).toBe(
      `${message}\n\nOpen Falcon: ${origin}/faculty/notifications?tab=unread`,
    );
  });

  it.each([undefined, null, ''])(
    'leaves no-link messages unchanged (%p)',
    (link) => {
      expect(notificationEmailBody(message, link, undefined)).toBe(message);
    },
  );

  it('permits harmless encoded path characters and same-origin fragments', () => {
    expect(
      notificationEmailBody(message, '/faculty/report%2D2026#review', origin),
    ).toBe(`${message}\n\nOpen Falcon: ${origin}/faculty/report%2D2026#review`);
  });

  it.each([
    'https://external.example.test/path',
    '//external.example.test/path',
    '/\\external.example.test/path',
    '\\external.example.test/path',
    'javascript:alert(1)',
    'data:text/plain,hello',
    'faculty/notifications',
    '/faculty/../admin',
    '/faculty/./notifications',
    '/%2e%2e/admin',
    '/faculty/%252e%252e/admin',
    '/%3f/%2e%2e/admin',
    '/%23/%252e%252e/admin',
    '/%2fexternal.example.test',
    '/%252fexternal.example.test',
    '/%5cexternal.example.test',
    '/%255cexternal.example.test',
    '/faculty/%0d%0aBcc:private@example.test',
    '/faculty/\nnotifications',
    '/faculty/\u0000notifications',
    '/faculty/not a path',
    '/faculty/%invalid',
    '/faculty/%2525252525252e%2525252525252e/admin',
  ])(
    'rejects unsafe or ambiguous links without disclosing them (%#)',
    (link) => {
      expect(() => notificationEmailBody(message, link, origin)).toThrow(
        'Portal notification link unavailable (LINK_CONFIGURATION)',
      );
    },
  );

  it.each([
    undefined,
    null,
    '',
    ' https://falcon.example.test',
    'https://falcon.example.test/',
    'https://falcon.example.test/path',
    'https://falcon.example.test?query=value',
    'https://falcon.example.test#fragment',
    'https://user:secret@falcon.example.test',
    'http://falcon.example.test',
    'file:///tmp/falcon',
  ])('rejects missing or unsafe frontend origins (%#)', (frontend) => {
    expect(() => notificationEmailBody(message, '/faculty', frontend)).toThrow(
      'Portal notification link unavailable (LINK_CONFIGURATION)',
    );
  });

  it.each(['localhost', '127.0.0.1', '[::1]'])(
    'permits HTTP %s only for explicitly selected development mode',
    (host) => {
      const frontend = `http://${host}:3001`;
      expect(
        notificationEmailBody(message, '/faculty', frontend, 'development'),
      ).toBe(`${message}\n\nOpen Falcon: ${frontend}/faculty`);
      for (const mode of ['production', 'test', undefined]) {
        expect(() =>
          notificationEmailBody(message, '/faculty', frontend, mode),
        ).toThrow('LINK_CONFIGURATION');
      }
    },
  );

  it('does not permit arbitrary HTTP hosts in development', () => {
    expect(() =>
      notificationEmailBody(
        message,
        '/faculty',
        'http://external.example.test:3001',
        'development',
      ),
    ).toThrow('LINK_CONFIGURATION');
  });
});
