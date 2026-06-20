import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomInt } from 'crypto';
import { DataSource } from 'typeorm';
import { FinanceLedgerService } from './finance-ledger.service';

const APPROVAL_THRESHOLD = 100000;
const OTP_TTL_MINUTES = 10;

type AuthUser = { user_id: string; tenant_id?: string; role_name?: string };

@Injectable()
export class FinanceApprovalsService {
  private readonly logger = new Logger(FinanceApprovalsService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly ledger: FinanceLedgerService,
  ) {}

  private tenantId(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  private otpHash(otp: string) {
    return createHash('sha256').update(otp).digest('hex');
  }

  async createApprovalRequest(params: {
    tenantId: string;
    entityType: 'PO' | 'VENDOR_INVOICE';
    entityId: string;
    requestedBy: string;
    amount: number;
  }) {
    const { tenantId, entityType, entityId, requestedBy, amount } = params;
    if (amount < APPROVAL_THRESHOLD) return null;

    const rows = await this.db.query(
      `INSERT INTO fin_approval_requests
         (tenant_id, entity_type, entity_id, requested_by, status, required_role, amount)
       VALUES ($1, $2, $3, $4, 'PENDING', 'CFO_OR_CHAIRMAN', $5)
       ON CONFLICT (tenant_id, entity_type, entity_id)
       DO UPDATE SET status = 'PENDING', requested_by = EXCLUDED.requested_by, amount = EXCLUDED.amount
       RETURNING approval_id`,
      [tenantId, entityType, entityId, requestedBy, amount],
    );

    return (rows[0] as { approval_id: string })?.approval_id ?? null;
  }

  async requestOtp(user: AuthUser, approvalId: string) {
    const tenantId = this.tenantId(user.tenant_id);

    const approvals = await this.db.query(
      `SELECT approval_id, status, amount FROM fin_approval_requests
       WHERE tenant_id = $1 AND approval_id = $2`,
      [tenantId, approvalId],
    );
    const approval = approvals[0] as
      | { approval_id: string; status: string; amount: string }
      | undefined;
    if (!approval) throw new NotFoundException('Approval request not found');
    if (approval.status !== 'PENDING')
      throw new BadRequestException('Approval is not pending');

    const otp = String(randomInt(0, 1000000)).padStart(6, '0');
    const expiresAt = new Date(
      Date.now() + OTP_TTL_MINUTES * 60 * 1000,
    ).toISOString();

    await this.db.query(
      `INSERT INTO fin_approval_otps (tenant_id, approval_id, otp_hash, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING otp_id`,
      [tenantId, approvalId, this.otpHash(otp), expiresAt],
    );

    this.logger.warn(`DEV OTP for approval ${approvalId}: ${otp}`);

    return { approval_id: approvalId, expires_at: expiresAt, dev_mode: true };
  }

  async verifyOtp(user: AuthUser, approvalId: string, otp: string) {
    const tenantId = this.tenantId(user.tenant_id);

    const role = String(user.role_name ?? '');
    const allowed =
      role === 'Chairman' || role === 'President' || role === 'SuperAdmin';
    if (!allowed) throw new ForbiddenException('Only CFO/Chairman can approve');

    return this.db.transaction(async (tx) => {
      const approvals = await tx.query(
        `SELECT approval_id, entity_type, entity_id, status
         FROM fin_approval_requests
         WHERE tenant_id = $1 AND approval_id = $2
         FOR UPDATE`,
        [tenantId, approvalId],
      );
      const approval = approvals[0] as
        | {
            entity_type: 'PO' | 'VENDOR_INVOICE';
            entity_id: string;
            status: string;
          }
        | undefined;
      if (!approval) throw new NotFoundException('Approval request not found');
      if (approval.status !== 'PENDING')
        throw new BadRequestException('Approval is not pending');

      const otpRows = await tx.query(
        `SELECT otp_id, otp_hash, expires_at, used_at
         FROM fin_approval_otps
         WHERE tenant_id = $1 AND approval_id = $2
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [tenantId, approvalId],
      );
      const otpRow = otpRows[0] as
        | {
            otp_id: string;
            otp_hash: string;
            expires_at: string;
            used_at: string | null;
          }
        | undefined;
      if (!otpRow) throw new BadRequestException('OTP not requested');
      if (otpRow.used_at) throw new BadRequestException('OTP already used');
      if (new Date(otpRow.expires_at).getTime() < Date.now())
        throw new BadRequestException('OTP expired');
      if (otpRow.otp_hash !== this.otpHash(otp))
        throw new BadRequestException('Invalid OTP');

      await tx.query(
        `UPDATE fin_approval_otps SET used_at = NOW() WHERE otp_id = $1`,
        [otpRow.otp_id],
      );
      await tx.query(
        `UPDATE fin_approval_requests
         SET status = 'APPROVED', approved_by = $3, approved_at = NOW()
         WHERE tenant_id = $1 AND approval_id = $2`,
        [tenantId, approvalId, user.user_id],
      );

      if (approval.entity_type === 'PO') {
        await tx.query(
          `UPDATE fin_purchase_orders
           SET status = 'APPROVED', approved_by = $3, approved_at = NOW()
           WHERE tenant_id = $1 AND po_id = $2`,
          [tenantId, approval.entity_id, user.user_id],
        );
      }

      if (approval.entity_type === 'VENDOR_INVOICE') {
        const invRows = await tx.query(
          `SELECT invoice_id, net_payable, gst_amount, tds_amount
           FROM fin_vendor_invoices
           WHERE tenant_id = $1 AND invoice_id = $2
           FOR UPDATE`,
          [tenantId, approval.entity_id],
        );
        const inv = invRows[0] as
          | {
              invoice_id: string;
              net_payable: string;
              gst_amount: string;
              tds_amount: string;
            }
          | undefined;
        if (!inv) throw new NotFoundException('Vendor invoice not found');

        await tx.query(
          `UPDATE fin_vendor_invoices
           SET status = 'APPROVED', approved_by = $3, approved_at = NOW()
           WHERE tenant_id = $1 AND invoice_id = $2`,
          [tenantId, approval.entity_id, user.user_id],
        );

        await this.ledger.postExpense(
          tenantId,
          inv.invoice_id,
          Number(inv.net_payable ?? 0),
          Number(inv.gst_amount ?? 0),
          Number(inv.tds_amount ?? 0),
          tx,
        );
      }

      return { ok: true, approval_id: approvalId };
    });
  }
}
