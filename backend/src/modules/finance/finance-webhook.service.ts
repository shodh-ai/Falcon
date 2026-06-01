import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Transaction } from '../../entities/transaction.entity';
import { FeeDemand } from '../../entities/fee-demand.entity';
import { GatewayWebhookDto } from './dto/gateway-webhook.dto';
import { FinanceReceiptService } from './finance-receipt.service';
import { FinanceLedgerService } from './finance-ledger.service';

@Injectable()
export class FinanceWebhookService {
  private readonly logger = new Logger(FinanceWebhookService.name);

  constructor(
    @InjectRepository(Transaction) private readonly transactions: Repository<Transaction>,
    @InjectRepository(FeeDemand) private readonly demands: Repository<FeeDemand>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly receipts: FinanceReceiptService,
    private readonly ledger: FinanceLedgerService,
  ) {}

  /**
   * Idempotent payment webhook — duplicate SUCCESS events are ignored.
   */
  async handleGatewayWebhook(provider: 'razorpay' | 'payu', dto: GatewayWebhookDto) {
    this.logger.log(`Webhook ${provider} event=${dto.event}`);

    if (dto.event !== 'payment.captured' && dto.event !== 'payment.success') {
      return { received: true, processed: false, reason: 'ignored_event' };
    }

    const paymentEntity = (dto.payload?.payment as { entity?: Record<string, unknown> })?.entity
      ?? (dto.payload as Record<string, unknown>);
    const paymentId = String(paymentEntity?.id ?? paymentEntity?.payment_id ?? '');
    const orderId = String(paymentEntity?.order_id ?? '');
    const amountPaise = Number(paymentEntity?.amount ?? 0);
    const amount = amountPaise > 1000 ? amountPaise / 100 : amountPaise;
    const notes = (paymentEntity?.notes as Record<string, unknown>) ?? {};
    const studentUserId = String(notes.student_user_id ?? notes.studentUserId ?? '');
    const demandId = String(notes.demand_id ?? notes.demandId ?? '');

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
    await this.transactions.save(txn);

    if (demandId) {
      const demand = await this.demands.findOne({ where: { demand_id: demandId } });
      if (demand) {
        const paid = Number(demand.paid_amount ?? 0) + amount;
        demand.paid_amount = paid;
        demand.status =
          paid >= Number(demand.total_amount) ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : demand.status;
        await this.demands.save(demand);
      }
    }

    const tenantRows = studentUserId
      ? await this.dataSource.query(`SELECT tenant_id FROM users WHERE user_id = $1`, [studentUserId])
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
        feeHead: demandId ? (await this.demands.findOne({ where: { demand_id: demandId } }))?.fee_head : undefined,
      });
      txn.receipt_url = receiptUrl;
      await this.transactions.save(txn);
      await this.receipts.emailReceipt(receiptStudentId, receiptUrl, amount);
    }

    await this.ledger.postFeePayment(tenantId, txn.transaction_id, amount);

    return { received: true, processed: true, transaction_id: txn.transaction_id, receipt_url: receiptUrl };
  }
}
