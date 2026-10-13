import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class FinanceLedgerService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private async lockSource(
    db: Pick<DataSource, 'query'>,
    tenantId: string,
    sourceType: string,
    sourceId: string,
  ) {
    await db.query(`SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [
      tenantId,
      `${sourceType}:${sourceId}`,
    ]);
  }

  private async requireAccounts(
    db: Pick<DataSource, 'query'>,
    tenantId: string,
    codes: string[],
  ) {
    const rows = await db.query(
      `SELECT ledger_account_id, account_code FROM finance_ledger_accounts
       WHERE tenant_id = $1 AND account_code = ANY($2::text[]) AND is_active = true`,
      [tenantId, codes],
    );
    const accounts = new Map<string, string>(
      (rows as Array<{ ledger_account_id: string; account_code: string }>).map(
        (row) => [row.account_code, row.ledger_account_id],
      ),
    );
    const missing = codes.filter((code) => !accounts.has(code));
    if (missing.length) {
      throw new InternalServerErrorException(
        `Finance ledger account mapping missing: ${missing.join(', ')}`,
      );
    }
    return accounts;
  }

  private validAmount(amount: number) {
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.abs(Math.round(amount * 100) - amount * 100) > 1e-7
    ) {
      throw new BadRequestException(
        'Amount must be a positive value in whole paise',
      );
    }
  }

  listAccounts(tenantId: string) {
    return this.dataSource.query(
      `SELECT ledger_account_id, account_code, account_name, account_type, is_active
       FROM finance_ledger_accounts
       WHERE tenant_id = $1
       ORDER BY account_code`,
      [tenantId],
    );
  }

  async postPayrollDisbursement(
    tenantId: string,
    payrollRunKey: string,
    amount: number,
  ) {
    this.validAmount(amount);
    return this.dataSource.transaction(async (tx) => {
      await this.lockSource(tx, tenantId, 'PAYROLL', payrollRunKey);
      const existing = await tx.query(
        `SELECT journal_entry_id
       FROM finance_journal_entries
       WHERE tenant_id = $1 AND source_type = 'PAYROLL' AND source_id = $2
       LIMIT 1`,
        [tenantId, payrollRunKey],
      );
      if (existing.length) return;

      const accounts = await this.requireAccounts(tx, tenantId, [
        '1000',
        '5000',
      ]);

      const entry = await tx.query(
        `INSERT INTO finance_journal_entries (tenant_id, narration, source_type, source_id)
       VALUES ($1, $2, 'PAYROLL', $3)
       RETURNING journal_entry_id`,
        [tenantId, `Payroll disbursement ${payrollRunKey}`, payrollRunKey],
      );
      const journalEntryId = (entry[0] as { journal_entry_id: string })
        .journal_entry_id;

      await tx.query(
        `INSERT INTO finance_journal_lines (journal_entry_id, ledger_account_id, debit_amount, credit_amount, ledger_category)
       VALUES
         ($1, $2, $3, 0, 'PAYROLL_TOTAL'),
         ($1, $4, 0, $3, 'BANK_OUT')`,
        [journalEntryId, accounts.get('5000'), amount, accounts.get('1000')],
      );
    });
  }

  async postFeePayment(
    tenantId: string,
    transactionId: string,
    amount: number,
    ctx?: {
      feeHead?: string;
      programCode?: string | null;
      templateId?: string | null;
    },
  ) {
    this.validAmount(amount);
    return this.dataSource.transaction(async (tx) => {
      await this.lockSource(tx, tenantId, 'FEE_PAYMENT', transactionId);
      const existing = await tx.query(
        `SELECT journal_entry_id
       FROM finance_journal_entries
       WHERE tenant_id = $1 AND source_type = 'FEE_PAYMENT' AND source_id = $2
       LIMIT 1`,
        [tenantId, transactionId],
      );
      if (existing.length) return;

      const accounts = await this.requireAccounts(tx, tenantId, [
        '1000',
        '4000',
      ]);

      const feeHead = ctx?.feeHead ?? 'TUITION';
      const rules = await tx.query(
        `SELECT ledger_category, weight
       FROM finance_allocation_rules
       WHERE tenant_id = $1
         AND fee_head = $2
         AND is_active = TRUE
         AND ($3::text IS NULL OR program_code = $3)
         AND ($4::uuid IS NULL OR template_id = $4::uuid)
       ORDER BY weight DESC, ledger_category ASC`,
        [tenantId, feeHead, ctx?.programCode ?? null, ctx?.templateId ?? null],
      );

      const allocations = (
        rules as Array<{ ledger_category: string; weight: string | number }>
      )
        .filter((r) => Number(r.weight) > 0)
        .map((r) => ({
          ledger_category: r.ledger_category,
          weight: Number(r.weight),
        }));

      const split = allocations.length
        ? allocations
        : [{ ledger_category: 'TUITION_GENERAL', weight: 1 }];

      const totalWeight = split.reduce((s, r) => s + r.weight, 0);
      const rounded = (value: number) => Math.round(value * 100) / 100;
      const amounts = split.map((r) => ({
        ledger_category: r.ledger_category,
        amount: 0,
        weight: r.weight,
      }));

      let remaining = rounded(amount);
      for (let i = 0; i < amounts.length; i += 1) {
        if (i === amounts.length - 1) {
          amounts[i].amount = remaining;
        } else {
          const part = rounded(
            (amount * amounts[i].weight) / (totalWeight || 1),
          );
          amounts[i].amount = part;
          remaining = rounded(remaining - part);
        }
      }

      const entry = await tx.query(
        `INSERT INTO finance_journal_entries (tenant_id, narration, source_type, source_id)
       VALUES ($1, $2, 'FEE_PAYMENT', $3)
       RETURNING journal_entry_id`,
        [tenantId, `Fee collection txn ${transactionId}`, transactionId],
      );
      const journalEntryId = (entry[0] as { journal_entry_id: string })
        .journal_entry_id;

      const values: string[] = [];
      const params: unknown[] = [journalEntryId];
      let idx = 2;

      values.push(`($1, $${idx}, $${idx + 1}, 0, $${idx + 2})`);
      params.push(accounts.get('1000'), amount, 'BANK_IN');
      idx += 3;

      for (const row of amounts) {
        values.push(`($1, $${idx}, 0, $${idx + 1}, $${idx + 2})`);
        params.push(accounts.get('4000'), row.amount, row.ledger_category);
        idx += 3;
      }

      await tx.query(
        `INSERT INTO finance_journal_lines (journal_entry_id, ledger_account_id, debit_amount, credit_amount, ledger_category)
       VALUES ${values.join(', ')}`,
        params,
      );
    });
  }

  /** Invoice approval creates a payable, not a cash disbursement. */
  async postVendorInvoiceAccrual(
    tenantId: string,
    invoiceId: string,
    netPayable: number,
    gstCredit: number,
    tds: number,
    tx?: Pick<DataSource, 'query'>,
  ) {
    const post = async (db: Pick<DataSource, 'query'>) => {
      this.validAmount(netPayable);
      if (
        ![gstCredit, tds].every((value) => Number.isFinite(value) && value >= 0)
      )
        throw new BadRequestException('Tax amounts must be non-negative');
      await this.lockSource(db, tenantId, 'VENDOR_INVOICE', invoiceId);
      const existing = await db.query(
        `SELECT journal_entry_id FROM finance_journal_entries
         WHERE tenant_id=$1 AND source_type='VENDOR_INVOICE' AND source_id=$2 LIMIT 1`,
        [tenantId, invoiceId],
      );
      if (existing.length) return;
      const taxable = Math.round((netPayable + tds - gstCredit) * 100) / 100;
      if (taxable <= 0)
        throw new BadRequestException(
          'Invoice taxable amount must be positive',
        );
      const codes = [
        '5100',
        '2000',
        ...(gstCredit > 0 ? ['5200'] : []),
        ...(tds > 0 ? ['5300'] : []),
      ];
      const accounts = await this.requireAccounts(db, tenantId, codes);
      const entry = await db.query(
        `INSERT INTO finance_journal_entries (tenant_id,narration,source_type,source_id)
         VALUES ($1,$2,'VENDOR_INVOICE',$3) RETURNING journal_entry_id`,
        [tenantId, `Vendor invoice ${invoiceId}`, invoiceId],
      );
      const id = (entry[0] as { journal_entry_id: string }).journal_entry_id;
      const lines = [
        {
          account: accounts.get('5100'),
          debit: taxable,
          credit: 0,
          category: 'OPERATIONS_GENERAL',
        },
        ...(gstCredit > 0
          ? [
              {
                account: accounts.get('5200'),
                debit: gstCredit,
                credit: 0,
                category: 'GST_INPUT',
              },
            ]
          : []),
        {
          account: accounts.get('2000'),
          debit: 0,
          credit: netPayable,
          category: 'VENDOR_PAYABLE',
        },
        ...(tds > 0
          ? [
              {
                account: accounts.get('5300'),
                debit: 0,
                credit: tds,
                category: 'TDS_PAYABLE',
              },
            ]
          : []),
      ];
      for (const line of lines) {
        await db.query(
          `INSERT INTO finance_journal_lines
           (journal_entry_id,ledger_account_id,debit_amount,credit_amount,ledger_category)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, line.account, line.debit, line.credit, line.category],
        );
      }
    };
    return tx ? post(tx) : this.dataSource.transaction(post);
  }

  async postExpense(
    tenantId: string,
    invoiceId: string,
    netPayable: number,
    gstCredit: number,
    tds: number,
    tx?: Pick<DataSource, 'query'>,
  ) {
    const post = async (db: Pick<DataSource, 'query'>) => {
      this.validAmount(netPayable);
      if (
        ![gstCredit, tds].every((value) => Number.isFinite(value) && value >= 0)
      )
        throw new BadRequestException('Tax amounts must be non-negative');
      await this.lockSource(db, tenantId, 'EXPENSE', invoiceId);

      const existing = await db.query(
        `SELECT journal_entry_id
       FROM finance_journal_entries
       WHERE tenant_id = $1 AND source_type = 'EXPENSE' AND source_id = $2
       LIMIT 1`,
        [tenantId, invoiceId],
      );
      if (existing.length) return;

      const codes = [
        '1000',
        '5100',
        ...(gstCredit > 0 ? ['5200'] : []),
        ...(tds > 0 ? ['5300'] : []),
      ];
      const map = await this.requireAccounts(db, tenantId, codes);

      const grossExpense = netPayable + tds - gstCredit;
      const entry = await db.query(
        `INSERT INTO finance_journal_entries (tenant_id, narration, source_type, source_id)
       VALUES ($1, $2, 'EXPENSE', $3) RETURNING journal_entry_id`,
        [tenantId, `Vendor invoice ${invoiceId}`, invoiceId],
      );
      const journalEntryId = (entry[0] as { journal_entry_id: string })
        .journal_entry_id;
      await db.query(
        `INSERT INTO finance_journal_lines (journal_entry_id, ledger_account_id, debit_amount, credit_amount, ledger_category)
       VALUES ($1, $2, $3, 0, 'OPERATIONS_GENERAL'), ($1, $4, 0, $5, 'BANK_OUT')`,
        [
          journalEntryId,
          map.get('5100'),
          grossExpense,
          map.get('1000'),
          netPayable,
        ],
      );
      if (gstCredit > 0)
        await db.query(
          `INSERT INTO finance_journal_lines (journal_entry_id,ledger_account_id,debit_amount,credit_amount,ledger_category)
       VALUES ($1,$2,$3,0,'GST_INPUT')`,
          [journalEntryId, map.get('5200'), gstCredit],
        );
      if (tds > 0)
        await db.query(
          `INSERT INTO finance_journal_lines (journal_entry_id,ledger_account_id,debit_amount,credit_amount,ledger_category)
       VALUES ($1,$2,0,$3,'TDS_PAYABLE')`,
          [journalEntryId, map.get('5300'), tds],
        );
    };
    return tx ? post(tx) : this.dataSource.transaction(post);
  }

  dayBook(tenantId: string, from?: string, to?: string) {
    return this.dataSource.query(
      `SELECT je.entry_date, je.narration, la.account_code, la.account_name,
              jl.debit_amount, jl.credit_amount
       FROM finance_journal_lines jl
       JOIN finance_journal_entries je ON je.journal_entry_id = jl.journal_entry_id
       JOIN finance_ledger_accounts la ON la.ledger_account_id = jl.ledger_account_id
         AND la.tenant_id = je.tenant_id
       WHERE je.tenant_id = $1
         AND ($2::date IS NULL OR je.entry_date >= $2::date)
         AND ($3::date IS NULL OR je.entry_date <= $3::date)
       ORDER BY je.entry_date, je.created_at`,
      [tenantId, from ?? null, to ?? null],
    );
  }

  trialBalance(tenantId: string) {
    return this.dataSource.query(
      `WITH movements AS (
         SELECT jl.ledger_account_id,
                SUM(jl.debit_amount) AS debit,
                SUM(jl.credit_amount) AS credit
         FROM finance_journal_entries je
         JOIN finance_journal_lines jl ON jl.journal_entry_id = je.journal_entry_id
         WHERE je.tenant_id = $1
         GROUP BY jl.ledger_account_id
       )
       SELECT la.account_code, la.account_name, la.account_type,
              COALESCE(m.debit, 0) AS total_debit,
              COALESCE(m.credit, 0) AS total_credit
       FROM finance_ledger_accounts la
       LEFT JOIN movements m ON m.ledger_account_id = la.ledger_account_id
       WHERE la.tenant_id = $1
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
