import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationDispatchService } from './notification-dispatch.service';
import { onboardingVerificationRequestedMessage } from './notification-message.catalog';
import type { OnboardingVerificationRequestedPayload } from './notification.events';
import { resolveOnboardingPortalKind } from '../../modules/student-onboarding/onboarding-portal.util';

const ADMISSIONS_ROLES = [
  'CampusAdmin',
  'AdmissionsOfficer',
  'Registrar',
  'SuperAdmin',
] as const;
const HR_ROLES = ['HR', 'HRAdmin'] as const;

@Injectable()
export class OnboardingVerificationNotifyService {
  constructor(
    private readonly dispatch: NotificationDispatchService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async listOfficersByRoleNames(
    tenantId: string,
    roleNames: readonly string[],
  ): Promise<string[]> {
    if (!roleNames.length) return [];
    const rows = await this.dataSource.query<Array<{ user_id: string }>>(
      `SELECT DISTINCT u.user_id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND r.role_name = ANY($2::text[])`,
      [tenantId, [...roleNames]],
    );
    return rows.map((row) => row.user_id);
  }

  private async filterRecipientsWithoutNotification(
    tenantId: string,
    targetUserId: string,
    userIds: string[],
  ): Promise<string[]> {
    if (!userIds.length) return [];
    const rows = await this.dataSource.query<Array<{ user_id: string }>>(
      `SELECT recipient.user_id
       FROM unnest($3::uuid[]) AS recipient(user_id)
       WHERE NOT EXISTS (
         SELECT 1
         FROM falcon_notifications n
         WHERE n.tenant_id = $1
           AND n.user_id = recipient.user_id
           AND n.deleted_at IS NULL
           AND n.metadata->>'targetUserId' = $2
           AND n.title LIKE 'Verification request —%'
       )`,
      [tenantId, targetUserId, userIds],
    );
    return rows.map((row) => row.user_id);
  }

  async notifyVerificationRequested(
    payload: OnboardingVerificationRequestedPayload,
  ): Promise<void> {
    const baseMessage = onboardingVerificationRequestedMessage(payload);

    if (payload.portalKind === 'student') {
      const recipients = await this.listOfficersByRoleNames(
        payload.tenantId,
        ADMISSIONS_ROLES,
      );
      const pendingRecipients = await this.filterRecipientsWithoutNotification(
        payload.tenantId,
        payload.targetUserId,
        recipients,
      );
      await this.dispatch.dispatchToMany(
        payload.tenantId,
        pendingRecipients,
        {
          ...baseMessage,
          actionLink: '/admissions-crm/verifications',
        },
        { queueDelivery: false },
      );
      return;
    }

    const admissionsRecipients = await this.listOfficersByRoleNames(
      payload.tenantId,
      ADMISSIONS_ROLES,
    );
    const hrRecipients = await this.listOfficersByRoleNames(
      payload.tenantId,
      HR_ROLES,
    );

    const pendingAdmissions = await this.filterRecipientsWithoutNotification(
      payload.tenantId,
      payload.targetUserId,
      admissionsRecipients,
    );
    if (pendingAdmissions.length) {
      await this.dispatch.dispatchToMany(
        payload.tenantId,
        pendingAdmissions,
        {
          ...baseMessage,
          actionLink: '/admissions-crm/verifications',
        },
        { queueDelivery: false },
      );
    }

    const hrOnlyRecipients = hrRecipients.filter(
      (userId) => !admissionsRecipients.includes(userId),
    );
    const pendingHr = await this.filterRecipientsWithoutNotification(
      payload.tenantId,
      payload.targetUserId,
      hrOnlyRecipients,
    );
    if (pendingHr.length) {
      await this.dispatch.dispatchToMany(
        payload.tenantId,
        pendingHr,
        {
          ...baseMessage,
          actionLink: '/hr/verifications',
        },
        { queueDelivery: false },
      );
    }
  }

  async dismissVerificationNotifications(
    tenantId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE falcon_notifications
       SET deleted_at = NOW()
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND metadata->>'targetUserId' = $2
         AND title LIKE 'Verification request —%'`,
      [tenantId, targetUserId],
    );
  }

  async dismissStaleVerificationNotifications(tenantId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE falcon_notifications n
       SET deleted_at = NOW()
       WHERE n.tenant_id = $1
         AND n.deleted_at IS NULL
         AND n.title LIKE 'Verification request —%'
         AND n.metadata->>'targetUserId' IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM users u
           WHERE u.tenant_id = n.tenant_id
             AND u.user_id = (n.metadata->>'targetUserId')::uuid
             AND u.onboarding_status = 'PENDING_ADMIN_APPROVAL'
         )`,
      [tenantId],
    );
  }

  async syncPendingVerificationNotifications(tenantId: string): Promise<void> {
    await this.dismissStaleVerificationNotifications(tenantId);

    const pending = await this.dataSource.query<
      Array<{
        user_id: string;
        name: string;
        official_email: string;
        role_name: string;
      }>
    >(
      `SELECT u.user_id, u.name, u.official_email, r.role_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1
         AND u.onboarding_status = 'PENDING_ADMIN_APPROVAL'`,
      [tenantId],
    );

    for (const row of pending) {
      await this.notifyVerificationRequested({
        tenantId,
        targetUserId: row.user_id,
        submitterName: row.name,
        submitterEmail: row.official_email,
        roleName: row.role_name,
        portalKind: resolveOnboardingPortalKind(row.role_name),
      });
    }
  }
}
