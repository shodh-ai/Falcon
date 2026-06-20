import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Transaction } from '../../entities/transaction.entity';
import { FeeDemand } from '../../entities/fee-demand.entity';
import { CampusWalletService } from '../campus-wallet/campus-wallet.service';
import { GatewayWebhookDto } from './dto/gateway-webhook.dto';
import { FinanceReceiptService } from './finance-receipt.service';
import { FinanceLedgerService } from './finance-ledger.service';

@Injectable()
export class FinanceWebhookService {
  private readonly logger = new Logger(FinanceWebhookService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    @InjectRepository(FeeDemand)
    private readonly demands: Repository<FeeDemand>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly receipts: FinanceReceiptService,
    private readonly ledger: FinanceLedgerService,
    private readonly events: EventEmitter2,
    private readonly campusWallet: CampusWalletService,
  ) {}

  /**
   * Idempotent payment webhook — duplicate SUCCESS events are ignored.
   */
  async handleGatewayWebhook(
    provider: 'razorpay' | 'payu',
    dto: GatewayWebhookDto,
  ) {
    this.logger.log(`Webhook ${provider} event=${dto.event}`);

    if (dto.event !== 'payment.captured' && dto.event !== 'payment.success') {
      return { received: true, processed: false, reason: 'ignored_event' };
    }

    const paymentEntity =
      (dto.payload?.payment as { entity?: Record<string, unknown> })?.entity ??
      dto.payload;
    const paymentId = String(
      paymentEntity?.id ?? paymentEntity?.payment_id ?? '',
    );
    const orderId = String(paymentEntity?.order_id ?? '');
    const amountPaise = Number(paymentEntity?.amount ?? 0);
    const amount = amountPaise > 1000 ? amountPaise / 100 : amountPaise;
    const notes = (paymentEntity?.notes as Record<string, unknown>) ?? {};
    const studentUserId = String(
      notes.student_user_id ?? notes.studentUserId ?? '',
    );
    const demandId = String(notes.demand_id ?? notes.demandId ?? '');
    const feeHead = String(notes.fee_head ?? notes.feeHead ?? '');
    const holdId = String(notes.hold_id ?? notes.holdId ?? '');
    const eventId = String(notes.event_id ?? notes.eventId ?? '');
    const registrationId = String(
      notes.registration_id ?? notes.registrationId ?? '',
    );
    const tenantIdFromNotes = String(notes.tenant_id ?? notes.tenantId ?? '');

    if (!paymentId) {
      return { received: true, processed: false, reason: 'missing_payment_id' };
    }

    const existing = await this.transactions.findOne({
      where: { gateway_payment_id: paymentId },
    });
    if (existing?.status === 'SUCCESS') {
      return { received: true, processed: false, duplicate: true };
    }

    let txn = existing;
    if (!txn) {
      txn = this.transactions.create({
        gateway: provider.toUpperCase() as Transaction['gateway'],
        gateway_payment_id: paymentId,
        gateway_order_id: orderId || null,
        gateway_reference: paymentId,
        amount,
        direction: 'IN',
        txn_kind: feeHead ? `FEE_${feeHead}` : 'FEE_PAYMENT',
        ledger_category:
          feeHead === 'HOSTEL_BOOKING'
            ? 'HOSTEL_GENERAL'
            : feeHead === 'EVENTS_CLUB'
              ? 'EVENTS_GENERAL'
              : feeHead === 'WALLET_TOPUP'
                ? 'WALLET_IN'
                : 'TUITION_GENERAL',
        status: 'INITIATED',
        student_user_id: studentUserId || null,
        demand_id: demandId || null,
        payment_mode: String(paymentEntity?.method ?? 'UPI').toUpperCase(),
        gateway_payload: dto.payload,
      });
      txn = await this.transactions.save(txn);
    }

    if (txn.status === 'SUCCESS') {
      return { received: true, processed: false, duplicate: true };
    }

    txn.status = 'SUCCESS';
    txn.gateway_payload = dto.payload;
    txn.direction = txn.direction ?? 'IN';
    txn.txn_kind = txn.txn_kind ?? (feeHead ? `FEE_${feeHead}` : 'FEE_PAYMENT');
    txn.ledger_category =
      txn.ledger_category ??
      (feeHead === 'HOSTEL_BOOKING'
        ? 'HOSTEL_GENERAL'
        : feeHead === 'EVENTS_CLUB'
          ? 'EVENTS_GENERAL'
          : feeHead === 'WALLET_TOPUP'
            ? 'WALLET_IN'
            : 'TUITION_GENERAL');
    await this.transactions.save(txn);

    if (feeHead === 'EVENTS_CLUB' && registrationId && studentUserId) {
      const tenantRows = await this.dataSource.query(
        `SELECT tenant_id FROM users WHERE user_id = $1`,
        [studentUserId],
      );
      const tenantId =
        tenantIdFromNotes ||
        (tenantRows[0] as { tenant_id: string } | undefined)?.tenant_id ||
        'a0000000-0000-4000-8000-000000000001';
      this.events.emit('event.registration.paid', {
        tenantId,
        studentUserId,
        registrationId,
        eventId: eventId || undefined,
        paymentId,
        feeHead: 'EVENTS_CLUB',
      });
      return {
        received: true,
        processed: true,
        event_registration: true,
        transaction_id: txn.transaction_id,
      };
    }

    if (feeHead === 'HOSTEL_BOOKING' && holdId && studentUserId) {
      const tenantRows = await this.dataSource.query(
        `SELECT tenant_id FROM users WHERE user_id = $1`,
        [studentUserId],
      );
      const tenantId =
        tenantIdFromNotes ||
        (tenantRows[0] as { tenant_id: string } | undefined)?.tenant_id ||
        'a0000000-0000-4000-8000-000000000001';
      this.events.emit('hostel.booking.payment_captured', {
        tenantId,
        studentUserId,
        holdId,
        paymentId,
        feeHead: 'HOSTEL_BOOKING',
      });
      return {
        received: true,
        processed: true,
        hostel_booking: true,
        transaction_id: txn.transaction_id,
      };
    }

    if (feeHead === 'WALLET_TOPUP' && studentUserId) {
      const tenantRows = await this.dataSource.query(
        `SELECT tenant_id FROM users WHERE user_id = $1`,
        [studentUserId],
      );
      const tenantId =
        tenantIdFromNotes ||
        (tenantRows[0] as { tenant_id: string } | undefined)?.tenant_id ||
        'a0000000-0000-4000-8000-000000000001';
      await this.campusWallet.topUp(tenantId, studentUserId, amount, paymentId);
      return {
        received: true,
        processed: true,
        wallet_topup: true,
        transaction_id: txn.transaction_id,
      };
    }

    if (demandId) {
      const demand = await this.demands.findOne({
        where: { demand_id: demandId },
      });
      if (demand) {
        const paid = Number(demand.paid_amount ?? 0) + amount;
        demand.paid_amount = paid;
        demand.status =
          paid >= Number(demand.total_amount)
            ? 'PAID'
            : paid > 0
              ? 'PARTIALLY_PAID'
              : demand.status;
        await this.demands.save(demand);

        if (demand.status === 'PAID') {
          const tenantRows = await this.dataSource.query(
            `SELECT tenant_id FROM users WHERE user_id = $1`,
            [demand.student_user_id],
          );
          const tenantId =
            (tenantRows[0] as { tenant_id: string } | undefined)?.tenant_id ??
            'a0000000-0000-4000-8000-000000000001';
          this.events.emit('finance.demand_paid', {
            demandId: demand.demand_id,
            feeHead: demand.fee_head,
            studentUserId: demand.student_user_id,
            amount,
            tenantId,
          });
        }
      }
    }

    const tenantRows = studentUserId
      ? await this.dataSource.query(
          `SELECT tenant_id FROM users WHERE user_id = $1`,
          [studentUserId],
        )
      : [];
    const tenantId =
      (tenantRows[0] as { tenant_id: string } | undefined)?.tenant_id ??
      'a0000000-0000-4000-8000-000000000001';

    const receiptStudentId = studentUserId || txn.student_user_id;
    const receiptNumber = `RCP-${new Date().getFullYear()}-${txn.transaction_id.slice(0, 8).toUpperCase()}`;
    let receiptUrl: string | null = null;
    if (receiptStudentId) {
      receiptUrl = await this.receipts.generateAndStore({
        tenantId,
        transactionId: txn.transaction_id,
        receiptNumber,
        studentUserId: receiptStudentId,
        amount,
        paymentMode: txn.payment_mode ?? undefined,
        feeHead: demandId
          ? (await this.demands.findOne({ where: { demand_id: demandId } }))
              ?.fee_head
          : undefined,
      });
      txn.receipt_url = receiptUrl;
      await this.transactions.save(txn);
      await this.receipts.emailReceipt(receiptStudentId, receiptUrl, amount);
    }

    await this.ledger.postFeePayment(tenantId, txn.transaction_id, amount, {
      feeHead: feeHead || undefined,
    });

    return {
      received: true,
      processed: true,
      transaction_id: txn.transaction_id,
      receipt_url: receiptUrl,
    };
  }
}
