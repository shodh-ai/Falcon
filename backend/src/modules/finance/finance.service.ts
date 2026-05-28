import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Not, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FeeDemand } from '../../entities/fee-demand.entity';
import { Transaction } from '../../entities/transaction.entity';
import { LateFinePolicy } from '../../entities/late-fine-policy.entity';
import { CreateFeeDemandDto } from './dto/create-fee-demand.dto';
import { GatewayWebhookDto } from './dto/gateway-webhook.dto';

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    @InjectRepository(FeeDemand) private demands: Repository<FeeDemand>,
    @InjectRepository(Transaction) private transactions: Repository<Transaction>,
    @InjectRepository(LateFinePolicy) private finePolicies: Repository<LateFinePolicy>,
  ) {}

  listDemands(studentUserId?: string) {
    if (studentUserId) {
      return this.demands.find({ where: { student_user_id: studentUserId }, order: { due_date: 'ASC' } });
    }
    return this.demands.find({ order: { due_date: 'ASC' } });
  }

  createDemand(dto: CreateFeeDemandDto) {
    return this.demands.save(this.demands.create(dto));
  }

  listFinePolicies() {
    return this.finePolicies.find();
  }

  /**
   * Nightly sweep: flips any unpaid demand past its due date to OVERDUE so
   * the UI can show the fine banner. The exact ₹ amount is computed lazily
   * from the active `LateFinePolicy.slabs` JSON at display / payment time.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markOverdueDemands(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const result = await this.demands
      .createQueryBuilder()
      .update(FeeDemand)
      .set({ status: 'OVERDUE' })
      .where({ due_date: LessThan(today), status: Not('PAID') })
      .andWhere('status NOT IN (:...skip)', { skip: ['OVERDUE', 'WAIVED'] })
      .execute();
    this.logger.log(`Late-fee sweep: marked ${result.affected ?? 0} demands as OVERDUE`);
  }

  async handleGatewayWebhook(provider: 'razorpay' | 'payu', dto: GatewayWebhookDto) {
    this.logger.log(`Received ${provider} webhook event=${dto.event}`);
    return { received: true, provider, event: dto.event };
  }

  listTransactions(studentUserId?: string) {
    if (studentUserId) {
      return this.transactions.find({ where: { student_user_id: studentUserId }, order: { created_at: 'DESC' } });
    }
    return this.transactions.find({ order: { created_at: 'DESC' } });
  }
}
