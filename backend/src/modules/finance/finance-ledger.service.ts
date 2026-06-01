import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class FinanceLedgerService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  listAccounts(tenantId: string) {
    return this.dataSource.query(
      `SELECT ledger_account_id, account_code, account_name, account_type, is_active
       FROM finance_ledger_accounts
       WHERE tenant_id = $1
       ORDER BY account_code`,
      [tenantId],
    );
  }

  async postFeePayment(tenantId: string, transactionId: string, amount: number) {
    const accounts = await this.dataSource.query(
      `SELECT ledger_account_id, account_code FROM finance_ledger_accounts
       WHERE tenant_id = $1 AND account_code IN ('1000', '4000')`,
      [tenantId],
    );
    const bank = (accounts as Array<{ ledger_account_id: string; account_code: string }>).find(
      (a) => a.account_code === '1000',
    );
    const income = (accounts as Array<{ ledger_account_id: string; account_code: string }>).find(
      (a) => a.account_code === '4000',
    );
    if (!bank || !income) return;

    const entry = await this.dataSource.query(
      `INSERT INTO finance_journal_entries (tenant_id, narration, source_type, source_id)
       VALUES ($1, $2, 'FEE_PAYMENT', $3)
       RETURNING journal_entry_id`,
      [tenantId, `Fee collection txn ${transactionId}`, transactionId],
    );
    const journalEntryId = (entry[0] as { journal_entry_id: string }).journal_entry_id;
    await this.dataSource.query(
      `INSERT INTO finance_journal_lines (journal_entry_id, ledger_account_id, debit_amount, credit_amount)
       VALUES ($1, $2, $3, 0), ($1, $4, 0, $3)`,
      [journalEntryId, bank.ledger_account_id, amount, income.ledger_account_id],
    );
  }

  async postExpense(tenantId: string, invoiceId: string, netPayable: number, gstCredit: number, tds: number) {
    const codes = ['1000', '5100', '5200', '5300'];
    const accounts = await this.dataSource.query(
      `SELECT ledger_account_id, account_code FROM finance_ledger_accounts
       WHERE tenant_id = $1 AND account_code = ANY($2)`,
      [tenantId, codes],
    );
    const map = new Map(
      (accounts as Array<{ ledger_account_id: string; account_code: string }>).map((a) => [
        a.account_code,
        a.ledger_account_id,
      ]),
    );
    const bank = map.get('1000');
    const expense = map.get('5100');
    if (!bank || !expense) return;

    const grossExpense = netPayable + tds - gstCredit;
    const entry = await this.dataSource.query(
      `INSERT INTO finance_journal_entries (tenant_id, narration, source_type, source_id)
       VALUES ($1, $2, 'EXPENSE', $3) RETURNING journal_entry_id`,
      [tenantId, `Vendor invoice ${invoiceId}`, invoiceId],
    );
    const journalEntryId = (entry[0] as { journal_entry_id: string }).journal_entry_id;
    await this.dataSource.query(
      `INSERT INTO finance_journal_lines (journal_entry_id, ledger_account_id, debit_amount, credit_amount)
       VALUES ($1, $2, $3, 0), ($1, $4, 0, $3)`,
      [journalEntryId, expense, grossExpense, bank, netPayable],
    );
  }

  dayBook(tenantId: string, from?: string, to?: string) {
    return this.dataSource.query(
      `SELECT je.entry_date, je.narration, la.account_code, la.account_name,
              jl.debit_amount, jl.credit_amount
       FROM finance_journal_lines jl
       JOIN finance_journal_entries je ON je.journal_entry_id = jl.journal_entry_id
       JOIN finance_ledger_accounts la ON la.ledger_account_id = jl.ledger_account_id
       WHERE je.tenant_id = $1
         AND ($2::date IS NULL OR je.entry_date >= $2::date)
         AND ($3::date IS NULL OR je.entry_date <= $3::date)
       ORDER BY je.entry_date, je.created_at`,
      [tenantId, from ?? null, to ?? null],
    );
  }

  trialBalance(tenantId: string) {
    return this.dataSource.query(
      `SELECT la.account_code, la.account_name, la.account_type,
              COALESCE(SUM(jl.debit_amount), 0) AS total_debit,
              COALESCE(SUM(jl.credit_amount), 0) AS total_credit
       FROM finance_ledger_accounts la
       LEFT JOIN finance_journal_lines jl ON jl.ledger_account_id = la.ledger_account_id
       LEFT JOIN finance_journal_entries je ON je.journal_entry_id = jl.journal_entry_id AND je.tenant_id = $1
       WHERE la.tenant_id = $1
       GROUP BY la.ledger_account_id, la.account_code, la.account_name, la.account_type
       ORDER BY la.account_code`,
      [tenantId],
    );
  }

  gstReport(tenantId: string, period: string) {
    return this.dataSource.query(
      `SELECT source_type, gst_amount, tds_amount, tax_period, filing_status
       FROM finance_gst_tds_tracking
       WHERE tenant_id = $1 AND tax_period = $2
       ORDER BY created_at`,
      [tenantId, period],
    );
  }

  tdsReport(tenantId: string, period: string) {
    return this.dataSource.query(
      `SELECT v.business_name, v.pan_number, t.tds_amount, t.source_type, t.tax_period
       FROM finance_gst_tds_tracking t
       LEFT JOIN fin_vendors v ON v.vendor_id = t.vendor_id
       WHERE t.tenant_id = $1 AND t.tax_period = $2 AND t.tds_amount > 0
       ORDER BY v.business_name`,
      [tenantId, period],
    );
  }
}
