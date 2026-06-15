import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

@Entity('finance_journal_lines')
export class FinanceJournalLine extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn('uuid')
  line_id: string;

  @Column({ type: 'uuid' })
  journal_entry_id: string;

  @Column({ type: 'uuid' })
  ledger_account_id: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  ledger_category: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  debit_amount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  credit_amount: number;
}
