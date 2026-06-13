import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { BaseTenantEntity } from './base-tenant.entity';

@Entity('finance_journal_entries')
@Index(['tenant_id', 'entry_date'])
export class FinanceJournalEntry extends BaseTenantEntity {
  @PrimaryGeneratedColumn('uuid')
  journal_entry_id: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  entry_date: string;

  @Column({ type: 'text' })
  narration: string;

  @Column({ length: 30 })
  source_type: string;

  @Column({ type: 'uuid', nullable: true })
  source_id: string | null;

  @CreateDateColumn()
  created_at: Date;
}
