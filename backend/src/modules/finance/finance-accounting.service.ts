import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type FinancePostingLine = {
  account_code: string;
  debit: string;
  credit: string;
  category?: string;
  dimensions?: Record<string, string>;
};

export type FinancePostingCommand = {
  tenant_id: string;
  source_type: string;
  source_id: string;
  source_revision: number;
  idempotency_key: string;
  entry_date: string;
  narration: string;
  lines: FinancePostingLine[];
};

type Book = {
  book_id: string;
  tenant_id: string;
  legal_name: string;
  base_currency: string;
  fiscal_start_month: number;
  authority_status: string;
  cutover_date: string | null;
  ledger_sequence: string | number;
};

type AccountBalance = {
  account_code: string;
  account_name: string;
  account_type: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' | 'EQUITY';
  debit: string;
  credit: string;
};

function cents(value: string): bigint {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new BadRequestException(
      'Journal amounts require decimal strings with at most two places',
    );
  }
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const absolute = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  return negative ? -absolute : absolute;
}

function money(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

@Injectable()
export class FinanceAccountingService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private reportRevision(book: Book, requested?: string): string {
    const current = BigInt(book.ledger_sequence);
    if (requested === undefined) return current.toString();
    if (!/^(0|[1-9]\d*)$/.test(requested) || BigInt(requested) > current) {
      throw new BadRequestException('Invalid ledger revision');
    }
    return requested;
  }

  async book(tenantId: string): Promise<Book> {
    const rows = await this.db.query(
      `SELECT book_id, tenant_id, legal_name, base_currency, fiscal_start_month,
              authority_status, cutover_date::text AS cutover_date, ledger_sequence
       FROM finance_books WHERE tenant_id=$1`,
      [tenantId],
    );
    if (!rows[0])
      throw new NotFoundException(
        'Finance book not configured for this tenant',
      );
    return rows[0] as Book;
  }

  async periods(tenantId: string) {
    const book = await this.book(tenantId);
    return this.db.query(
      `SELECT period_id,start_date,end_date,status,revision,closed_at
       FROM finance_fiscal_periods WHERE tenant_id=$1 AND book_id=$2
       ORDER BY start_date DESC`,
      [tenantId, book.book_id],
    );
  }

  async journalIntegrity(tenantId: string) {
    const book = await this.book(tenantId);
    const [summary, exceptions] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*)::integer AS inspected,
                COUNT(*) FILTER (WHERE line_count<2 OR debits<>credits)::integer AS unbalanced_or_incomplete,
                COUNT(*) FILTER (WHERE cross_tenant_lines>0)::integer AS cross_tenant,
                COUNT(*) FILTER (WHERE line_count<2 OR debits<>credits OR cross_tenant_lines>0)::integer AS total_exceptions
         FROM finance_journal_integrity_audit WHERE tenant_id=$1`,
        [tenantId],
      ),
      this.db.query(
        `SELECT journal_entry_id,source_type,source_id,entry_date,line_count,
                debits::text,credits::text,cross_tenant_lines
         FROM finance_journal_integrity_audit
         WHERE tenant_id=$1 AND (line_count<2 OR debits<>credits OR cross_tenant_lines>0)
         ORDER BY entry_date DESC,journal_entry_id LIMIT 100`,
        [tenantId],
      ),
    ]);
    return {
      book,
      status: 'CUTOVER_REVIEW_REQUIRED',
      summary: summary[0],
      exceptions,
      exceptions_truncated:
        Number(summary[0].total_exceptions) > exceptions.length,
    };
  }

  /** Internal posting port. Never expose this directly to an operator or source client. */
  async post(command: FinancePostingCommand) {
    if (
      !command.idempotency_key ||
      !command.source_type ||
      !command.source_id ||
      !Number.isSafeInteger(command.source_revision) ||
      command.source_revision < 1 ||
      !validDate(command.entry_date) ||
      !command.narration?.trim() ||
      command.lines.length < 2
    ) {
      throw new BadRequestException('Incomplete finance posting command');
    }
    let totalDebit = 0n;
    let totalCredit = 0n;
    for (const line of command.lines) {
      const debit = cents(line.debit);
      const credit = cents(line.credit);
      if (
        !line.account_code ||
        debit < 0n ||
        credit < 0n ||
        debit > 0n === credit > 0n
      ) {
        throw new BadRequestException(
          'Every journal line must have one positive side and an account',
        );
      }
      totalDebit += debit;
      totalCredit += credit;
    }
    if (totalDebit === 0n || totalDebit !== totalCredit) {
      throw new BadRequestException('Journal debits and credits must balance');
    }
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(command))
      .digest('hex');
    return this.db.transaction(async (tx) => {
      await tx.query(
        `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
        [
          command.tenant_id,
          `${command.source_type}:${command.source_id}:${command.source_revision}`,
        ],
      );
      const books = await tx.query(
        `SELECT book_id,base_currency,authority_status,cutover_date::text AS cutover_date,ledger_sequence
         FROM finance_books WHERE tenant_id=$1 FOR UPDATE`,
        [command.tenant_id],
      );
      const book = books[0] as Book | undefined;
      if (!book) throw new NotFoundException('Finance book not configured');
      if (book.authority_status === 'PAUSED')
        throw new ConflictException('Finance posting is paused');
      if (book.cutover_date && command.entry_date < book.cutover_date) {
        throw new ConflictException(
          'Posting precedes the approved cutover date',
        );
      }
      const existing = await tx.query(
        `SELECT journal_entry_id,payload_hash FROM finance_journal_entries
         WHERE (tenant_id=$1 AND idempotency_key=$2)
            OR (book_id=$3 AND source_type=$4 AND source_id=$5 AND source_revision=$6)
         LIMIT 1`,
        [
          command.tenant_id,
          command.idempotency_key,
          book.book_id,
          command.source_type,
          command.source_id,
          command.source_revision,
        ],
      );
      if (existing[0]) {
        if (existing[0].payload_hash !== payloadHash) {
          throw new ConflictException(
            'Finance posting retry changed its payload',
          );
        }
        return {
          journal_entry_id: existing[0].journal_entry_id,
          duplicate: true,
        };
      }
      const periods = await tx.query(
        `SELECT period_id FROM finance_fiscal_periods
         WHERE book_id=$1 AND tenant_id=$2 AND status='OPEN'
           AND $3::date BETWEEN start_date AND end_date FOR SHARE`,
        [book.book_id, command.tenant_id, command.entry_date],
      );
      if (periods.length !== 1)
        throw new ConflictException(
          'No unique open fiscal period for posting date',
        );
      const codes = [
        ...new Set(command.lines.map((line) => line.account_code)),
      ];
      const rows = await tx.query(
        `SELECT ledger_account_id,account_code FROM finance_ledger_accounts
         WHERE tenant_id=$1 AND is_active=true AND account_code=ANY($2::text[])`,
        [command.tenant_id, codes],
      );
      const accounts = new Map<string, string>(
        (
          rows as Array<{ ledger_account_id: string; account_code: string }>
        ).map((row) => [row.account_code, row.ledger_account_id]),
      );
      if (accounts.size !== codes.length) {
        throw new ConflictException(
          'One or more approved ledger account mappings are missing',
        );
      }
      const nextSequence = BigInt(book.ledger_sequence) + 1n;
      await tx.query(
        `UPDATE finance_books SET ledger_sequence=$2,updated_at=NOW()
         WHERE tenant_id=$1 AND book_id=$3`,
        [command.tenant_id, nextSequence.toString(), book.book_id],
      );
      const inserted = await tx.query(
        `INSERT INTO finance_journal_entries
         (tenant_id,book_id,period_id,entry_date,narration,source_type,source_id,
          source_revision,idempotency_key,payload_hash,book_sequence,posting_status,posted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'POSTED',NOW())
         RETURNING journal_entry_id`,
        [
          command.tenant_id,
          book.book_id,
          periods[0].period_id,
          command.entry_date,
          command.narration.trim(),
          command.source_type,
          command.source_id,
          command.source_revision,
          command.idempotency_key,
          payloadHash,
          nextSequence.toString(),
        ],
      );
      const journalId = (inserted[0] as { journal_entry_id: string })
        .journal_entry_id;
      for (const line of command.lines) {
        await tx.query(
          `INSERT INTO finance_journal_lines
           (journal_entry_id,ledger_account_id,debit_amount,credit_amount,ledger_category,dimensions)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
          [
            journalId,
            accounts.get(line.account_code),
            money(cents(line.debit)),
            money(cents(line.credit)),
            line.category ?? null,
            JSON.stringify(line.dimensions ?? {}),
          ],
        );
      }
      return {
        journal_entry_id: journalId,
        book_sequence: nextSequence.toString(),
        duplicate: false,
      };
    });
  }

  async trialBalance(
    tenantId: string,
    asOf?: string,
    ledgerRevision?: string,
  ): Promise<{
    book: Book;
    as_of: string;
    ledger_revision: string;
    status: string;
    accounts: AccountBalance[];
    total_debit: string;
    total_credit: string;
    balanced: boolean;
  }> {
    const book = await this.book(tenantId);
    const revision = this.reportRevision(book, ledgerRevision);
    const date = asOf ?? new Date().toISOString().slice(0, 10);
    if (!validDate(date)) throw new BadRequestException('Invalid as_of date');
    const accounts = (await this.db.query(
      `WITH movements AS (
         SELECT jl.ledger_account_id,
                SUM(jl.debit_amount) AS debit,SUM(jl.credit_amount) AS credit
         FROM finance_journal_entries je
         JOIN finance_journal_lines jl ON jl.journal_entry_id=je.journal_entry_id
         WHERE je.book_id=$2 AND je.tenant_id=$1 AND je.posting_status='POSTED'
           AND je.entry_date<=$3::date AND je.book_sequence<=$4::bigint
         GROUP BY jl.ledger_account_id
       )
       SELECT la.account_code,la.account_name,la.account_type,
              GREATEST(COALESCE(m.debit,0)-COALESCE(m.credit,0),0)::text AS debit,
              GREATEST(COALESCE(m.credit,0)-COALESCE(m.debit,0),0)::text AS credit
       FROM finance_ledger_accounts la
       LEFT JOIN movements m ON m.ledger_account_id=la.ledger_account_id
       WHERE la.tenant_id=$1 ORDER BY la.account_code`,
      [tenantId, book.book_id, date, revision],
    )) as AccountBalance[];
    const debits = accounts.reduce((sum, row) => sum + cents(row.debit), 0n);
    const credits = accounts.reduce((sum, row) => sum + cents(row.credit), 0n);
    return {
      book,
      as_of: date,
      ledger_revision: revision,
      status: book.authority_status === 'OFFICIAL' ? 'OFFICIAL' : 'PROVISIONAL',
      accounts,
      total_debit: money(debits),
      total_credit: money(credits),
      balanced: debits === credits,
    };
  }

  async incomeExpenditure(
    tenantId: string,
    asOf?: string,
    ledgerRevision?: string,
  ) {
    const book = await this.book(tenantId);
    const revision = this.reportRevision(book, ledgerRevision);
    const date = asOf ?? new Date().toISOString().slice(0, 10);
    if (!validDate(date)) throw new BadRequestException('Invalid as_of date');
    const fiscalYear =
      Number(date.slice(0, 4)) -
      (Number(date.slice(5, 7)) < book.fiscal_start_month ? 1 : 0);
    const fiscalStart = `${fiscalYear}-${String(book.fiscal_start_month).padStart(2, '0')}-01`;
    const accounts = (await this.db.query(
      `WITH movements AS (
         SELECT jl.ledger_account_id,SUM(jl.debit_amount) AS debit,
                SUM(jl.credit_amount) AS credit
         FROM finance_journal_entries je
         JOIN finance_journal_lines jl ON jl.journal_entry_id=je.journal_entry_id
         WHERE je.book_id=$2 AND je.tenant_id=$1 AND je.posting_status='POSTED'
           AND je.entry_date BETWEEN $3::date AND $4::date
           AND je.book_sequence<=$5::bigint
         GROUP BY jl.ledger_account_id
       )
       SELECT la.account_code,la.account_name,la.account_type,
              COALESCE(m.debit,0)::text AS debit,
              COALESCE(m.credit,0)::text AS credit
       FROM finance_ledger_accounts la
       LEFT JOIN movements m ON m.ledger_account_id=la.ledger_account_id
       WHERE la.tenant_id=$1 AND la.account_type IN ('INCOME','EXPENSE')
       ORDER BY la.account_code`,
      [tenantId, book.book_id, fiscalStart, date, revision],
    )) as AccountBalance[];
    const income = accounts
      .filter((a) => a.account_type === 'INCOME')
      .map((a) => ({ ...a, balance: money(cents(a.credit) - cents(a.debit)) }));
    const expenses = accounts
      .filter((a) => a.account_type === 'EXPENSE')
      .map((a) => ({ ...a, balance: money(cents(a.debit) - cents(a.credit)) }));
    const totalIncome = income.reduce((sum, a) => sum + cents(a.balance), 0n);
    const totalExpenses = expenses.reduce(
      (sum, a) => sum + cents(a.balance),
      0n,
    );
    return {
      book,
      fiscal_start: fiscalStart,
      as_of: date,
      ledger_revision: revision,
      status: book.authority_status === 'OFFICIAL' ? 'OFFICIAL' : 'PROVISIONAL',
      income,
      expenses,
      surplus: money(totalIncome - totalExpenses),
    };
  }

  async balanceSheet(tenantId: string, asOf?: string, ledgerRevision?: string) {
    const trial = await this.trialBalance(tenantId, asOf, ledgerRevision);
    const assets = trial.accounts
      .filter((a) => a.account_type === 'ASSET')
      .map((a) => ({ ...a, balance: money(cents(a.debit) - cents(a.credit)) }));
    const liabilities = trial.accounts
      .filter((a) => a.account_type === 'LIABILITY')
      .map((a) => ({ ...a, balance: money(cents(a.credit) - cents(a.debit)) }));
    const funds = trial.accounts
      .filter((a) => a.account_type === 'EQUITY')
      .map((a) => ({ ...a, balance: money(cents(a.credit) - cents(a.debit)) }));
    const statement = await this.incomeExpenditure(
      tenantId,
      asOf,
      trial.ledger_revision,
    );
    const cumulativeSurplus = trial.accounts.reduce((sum, account) => {
      if (account.account_type === 'INCOME')
        return sum + cents(account.credit) - cents(account.debit);
      if (account.account_type === 'EXPENSE')
        return sum + cents(account.credit) - cents(account.debit);
      return sum;
    }, 0n);
    const priorSurplus = cumulativeSurplus - cents(statement.surplus);
    const totalAssets = assets.reduce(
      (sum, account) => sum + cents(account.balance),
      0n,
    );
    const totalLiabilitiesAndFunds = [...liabilities, ...funds].reduce(
      (sum, account) => sum + cents(account.balance),
      cumulativeSurplus,
    );
    return {
      book: trial.book,
      as_of: trial.as_of,
      ledger_revision: trial.ledger_revision,
      status: trial.status,
      assets,
      liabilities,
      funds,
      current_surplus: statement.surplus,
      prior_surplus: money(priorSurplus),
      total_assets: money(totalAssets),
      total_liabilities_and_funds: money(totalLiabilitiesAndFunds),
      balanced: trial.balanced && totalAssets === totalLiabilitiesAndFunds,
    };
  }

  async generalLedger(
    tenantId: string,
    accountCode: string,
    from: string,
    to: string,
    ledgerRevision?: string,
  ) {
    if (!validDate(from) || !validDate(to) || from > to) {
      throw new BadRequestException('A valid from/to date range is required');
    }
    const book = await this.book(tenantId);
    const revision = this.reportRevision(book, ledgerRevision);
    const accounts = await this.db.query(
      `SELECT ledger_account_id,account_code,account_name,account_type
       FROM finance_ledger_accounts WHERE tenant_id=$1 AND account_code=$2`,
      [tenantId, accountCode],
    );
    if (!accounts[0]) throw new NotFoundException('Ledger account not found');
    const opening = await this.db.query(
      `SELECT COALESCE(SUM(jl.debit_amount),0)::text AS debit,
              COALESCE(SUM(jl.credit_amount),0)::text AS credit
       FROM finance_journal_entries je
       JOIN finance_journal_lines jl ON jl.journal_entry_id=je.journal_entry_id
       WHERE je.tenant_id=$1 AND je.book_id=$2 AND je.posting_status='POSTED'
         AND jl.ledger_account_id=$3 AND je.entry_date<$4::date
         AND je.book_sequence<=$5::bigint`,
      [tenantId, book.book_id, accounts[0].ledger_account_id, from, revision],
    );
    const lines = await this.db.query(
      `SELECT je.journal_entry_id,je.entry_date,je.narration,je.source_type,
              je.source_id,je.source_revision,je.book_sequence,
              jl.debit_amount::text AS debit,jl.credit_amount::text AS credit,
              jl.dimensions
       FROM finance_journal_entries je
       JOIN finance_journal_lines jl ON jl.journal_entry_id=je.journal_entry_id
       WHERE je.tenant_id=$1 AND je.book_id=$2 AND je.posting_status='POSTED'
         AND jl.ledger_account_id=$3 AND je.entry_date BETWEEN $4::date AND $5::date
         AND je.book_sequence<=$6::bigint
       ORDER BY je.entry_date,je.book_sequence,jl.line_id`,
      [
        tenantId,
        book.book_id,
        accounts[0].ledger_account_id,
        from,
        to,
        revision,
      ],
    );
    const openingDebit = cents(opening[0].debit);
    const openingCredit = cents(opening[0].credit);
    const movementDebit = (lines as Array<{ debit: string }>).reduce(
      (sum, line) => sum + cents(line.debit),
      0n,
    );
    const movementCredit = (lines as Array<{ credit: string }>).reduce(
      (sum, line) => sum + cents(line.credit),
      0n,
    );
    const openingNet = openingDebit - openingCredit;
    const closingNet = openingNet + movementDebit - movementCredit;
    return {
      book,
      account: accounts[0],
      from,
      to,
      ledger_revision: revision,
      status: book.authority_status === 'OFFICIAL' ? 'OFFICIAL' : 'PROVISIONAL',
      opening_debit: money(openingNet > 0n ? openingNet : 0n),
      opening_credit: money(openingNet < 0n ? -openingNet : 0n),
      movement_debit: money(movementDebit),
      movement_credit: money(movementCredit),
      closing_debit: money(closingNet > 0n ? closingNet : 0n),
      closing_credit: money(closingNet < 0n ? -closingNet : 0n),
      lines,
    };
  }
}
