// Optional injection only. Normal AuthModule does not bind this token.
export const PASSWORD_RESET_DELIVERY = Symbol('PASSWORD_RESET_DELIVERY');
export interface PasswordResetAccount {
  userId: string;
  tenantId: string;
  email: string;
}
export interface PasswordResetDelivery {
  readonly frontendUrl: string;
  allowsSyntheticAccount(account: PasswordResetAccount): boolean;
  send(message: { to: string; html: string; text: string }): Promise<void>;
}
