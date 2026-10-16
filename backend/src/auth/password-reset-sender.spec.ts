import { selectPasswordResetSender } from './password-reset-sender';

it('selects the exact institutional Falcon sender without a transport', () => {
  const config = Object.freeze({
    PASSWORD_RESET_EMAIL_FROM_ADDRESS: 'noreply.ums@mygyanvihar.com',
    PASSWORD_RESET_EMAIL_FROM_NAME: 'Falcon',
    EMAIL_FROM: 'Shared Notices <notices@example.test>',
  });
  const selected = selectPasswordResetSender(config);
  expect(selected).toEqual({
    requireTLS: true,
    from: [{ name: 'Falcon', address: 'noreply.ums@mygyanvihar.com' }],
  });
  expect(`${selected.from[0].name} <${selected.from[0].address}>`).toBe(
    'Falcon <noreply.ums@mygyanvihar.com>',
  );
  expect(config.EMAIL_FROM).toBe('Shared Notices <notices@example.test>');
});

it('never falls back to a personal or shared sender when the override is absent', () => {
  const selected = selectPasswordResetSender({
    EMAIL_FROM: 'Personal Sender <personal@example.test>',
    EMAIL_USER: 'personal@example.test',
  });
  expect(selected.from).toEqual([
    { name: 'Falcon', address: 'noreply.ums@mygyanvihar.com' },
  ]);
});

it('rejects a conflicting sender override', () => {
  expect(() =>
    selectPasswordResetSender({
      PASSWORD_RESET_EMAIL_FROM_ADDRESS: 'personal@example.test',
    }),
  ).toThrow();
});
