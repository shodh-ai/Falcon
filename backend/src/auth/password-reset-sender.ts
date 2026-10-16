export const PASSWORD_RESET_SENDER = 'noreply.ums@mygyanvihar.com';

// Pure selection only: no transport, environment loading or application imports.
export function selectPasswordResetSender(
  config: Readonly<Record<string, string | undefined>>,
) {
  const resetSender =
    config.PASSWORD_RESET_EMAIL_FROM_ADDRESS === undefined
      ? PASSWORD_RESET_SENDER
      : config.PASSWORD_RESET_EMAIL_FROM_ADDRESS.trim();
  if (resetSender !== PASSWORD_RESET_SENDER) {
    throw new Error('Invalid password-reset sender configuration');
  }
  return {
    requireTLS: true,
    from: [{ name: 'Falcon', address: PASSWORD_RESET_SENDER }],
  };
}
