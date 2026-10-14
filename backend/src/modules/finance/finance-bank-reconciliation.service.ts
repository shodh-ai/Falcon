import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ObjectStorageService } from '../../storage/object-storage.service';

const execFileAsync = promisify(execFile);

type StatementLine = {
  transaction_date: string;
  value_date?: string;
  description: string;
  bank_reference?: string;
  debit: string;
  credit: string;
  running_balance?: string;
};

export type BankStatementImport = {
  bank_account_id: string;
  period_start: string;
  period_end: string;
  opening_balance: string;
  closing_balance: string;
  source_upload_id: string;
};

function parseStatementCsv(buffer: Buffer): StatementLine[] {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new BadRequestException('Statement CSV must be UTF-8');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') {
      if (field.length)
        throw new BadRequestException('Malformed quoted CSV field');
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      if (rows.length > 10001)
        throw new BadRequestException('Statement exceeds 10,000 rows');
    } else field += char;
  }
  if (quoted) throw new BadRequestException('Unclosed CSV quote');
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  const expected = [
    'transaction_date',
    'value_date',
    'description',
    'bank_reference',
    'debit',
    'credit',
    'running_balance',
  ];
  if (
    !rows.length ||
    rows[0].length !== expected.length ||
    rows[0].some((cell, index) => cell.trim().toLowerCase() !== expected[index])
  )
    throw new BadRequestException(
      `Statement CSV headers must be: ${expected.join(',')}`,
    );
  if (
    rows.length < 2 ||
    rows.length > 10001 ||
    rows.slice(1).some((r) => r.length !== expected.length)
  )
    throw new BadRequestException(
      'Statement CSV has no rows or inconsistent columns',
    );
  return rows.slice(1).map((cells) => ({
    transaction_date: cells[0].trim(),
    value_date: cells[1].trim() || undefined,
    description: cells[2].trim(),
    bank_reference: cells[3].trim() || undefined,
    debit: cells[4].trim() || '0.00',
    credit: cells[5].trim() || '0.00',
    running_balance: cells[6].trim() || undefined,
  }));
}

function amount(value: string): bigint {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d{1,2})?$/.test(value))
    throw new BadRequestException(
      'Money must be a decimal string with at most two places',
    );
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const result = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  return negative ? -result : result;
}

function money(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

function validDate(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

@Injectable()
export class FinanceBankReconciliationService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly storage: ObjectStorageService,
  ) {}

  async uploadStatementFile(
    tenantId: string,
    actorId: string,
    bankAccountId: string,
    key: string,
    file: Express.Multer.File,
  ) {
    if (
      !key?.trim() ||
      !file?.buffer?.length ||
      file.buffer.length > 5 * 1024 * 1024 ||
      !file.originalname?.toLowerCase().endsWith('.csv') ||
      !['text/csv', 'application/vnd.ms-excel', 'text/plain'].includes(
        file.mimetype,
      )
    )
      throw new BadRequestException(
        'A CSV statement up to 5 MB and Idempotency-Key are required',
      );
    const lines = parseStatementCsv(file.buffer);
    const digest = createHash('sha256').update(file.buffer).digest('hex');
    return this.db.transaction(async (tx) => {
      const banks = await tx.query(
        `SELECT bank_account_id FROM finance_bank_accounts WHERE tenant_id=$1
         AND bank_account_id=$2 AND status='ACTIVE' FOR UPDATE`,
        [tenantId, bankAccountId],
      );
      if (!banks[0])
        throw new NotFoundException('Active bank account not found');
      const existing = await tx.query(
        `SELECT upload_id,source_sha256 FROM finance_bank_statement_uploads
       WHERE tenant_id=$1 AND bank_account_id=$2 AND idempotency_key=$3`,
        [tenantId, bankAccountId, key],
      );
      if (existing[0]) {
        if (existing[0].source_sha256 !== digest)
          throw new ConflictException('Changed statement upload retry');
        return {
          upload_id: existing[0].upload_id,
          source_sha256: digest,
          line_count: lines.length,
          duplicate: true,
        };
      }
      const duplicate = await tx.query(
        `SELECT upload_id FROM finance_bank_statement_uploads
       WHERE tenant_id=$1 AND bank_account_id=$2 AND source_sha256=$3`,
        [tenantId, bankAccountId, digest],
      );
      if (duplicate[0])
        throw new ConflictException('Statement file already uploaded');
      const scanner = process.env.FINANCE_CLAMAV_COMMAND?.trim();
      if (
        process.env.NODE_ENV === 'production' &&
        (!scanner || !this.storage.isEnabled())
      )
        throw new ConflictException(
          'Secure storage and malware scanner are required for bank statements',
        );
      if (scanner) {
        const dir = await mkdtemp(join(tmpdir(), 'falcon-bank-statement-'));
        const path = join(dir, 'statement.csv');
        try {
          await writeFile(path, file.buffer, { mode: 0o600, flag: 'wx' });
          try {
            await execFileAsync(scanner, ['--no-summary', path], {
              timeout: 30000,
              maxBuffer: 512 * 1024,
            });
          } catch {
            throw new BadRequestException('Statement failed malware scanning');
          }
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      }
      const objectKey = this.storage.buildKey(
        tenantId,
        `finance/bank-statements/${bankAccountId}/${randomUUID()}.csv`,
      );
      await this.storage.upload(tenantId, objectKey, file.buffer, 'text/csv');
      const inserted = await tx.query(
        `INSERT INTO finance_bank_statement_uploads
       (tenant_id,bank_account_id,object_key,original_filename,source_sha256,
        idempotency_key,byte_size,parsed_lines,uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING upload_id`,
        [
          tenantId,
          bankAccountId,
          objectKey,
          file.originalname,
          digest,
          key,
          file.buffer.length,
          JSON.stringify(lines),
          actorId,
        ],
      );
      return {
        upload_id: inserted[0].upload_id,
        source_sha256: digest,
        line_count: lines.length,
        duplicate: false,
      };
    });
  }

  async bankAccounts(tenantId: string) {
    return this.db.query(
      `SELECT ba.bank_account_id,ba.display_name,ba.masked_account_number,
              ba.currency,ba.status,ba.revision,la.account_code,la.account_name
       FROM finance_bank_accounts ba
       JOIN finance_ledger_accounts la ON la.ledger_account_id=ba.ledger_account_id
         AND la.tenant_id=ba.tenant_id
       WHERE ba.tenant_id=$1 ORDER BY ba.display_name`,
      [tenantId],
    );
  }

  async registerBankAccount(
    tenantId: string,
    actorId: string,
    input: {
      account_code: string;
      display_name: string;
      masked_account_number: string;
    },
  ) {
    if (
      !input.account_code?.trim() ||
      !input.display_name?.trim() ||
      !/^\*{2,}\d{4}$/.test(input.masked_account_number ?? '')
    )
      throw new BadRequestException(
        'Account code, display name and masked last-four account number are required',
      );
    return this.db.transaction(async (tx) => {
      const rows = await tx.query(
        `SELECT b.book_id,b.base_currency,la.ledger_account_id
         FROM finance_books b JOIN finance_ledger_accounts la
           ON la.tenant_id=b.tenant_id
         WHERE b.tenant_id=$1 AND la.account_code=$2 AND la.account_type='ASSET'
           AND la.is_active=true FOR UPDATE OF b,la`,
        [tenantId, input.account_code],
      );
      if (!rows[0])
        throw new ConflictException(
          'An active asset ledger mapping is required',
        );
      const existing = await tx.query(
        `SELECT * FROM finance_bank_accounts WHERE tenant_id=$1 AND ledger_account_id=$2`,
        [tenantId, rows[0].ledger_account_id],
      );
      if (existing[0]) {
        if (
          existing[0].display_name !== input.display_name.trim() ||
          existing[0].masked_account_number !== input.masked_account_number
        )
          throw new ConflictException(
            'Bank ledger mapping already exists with different details',
          );
        return existing[0];
      }
      const inserted = await tx.query(
        `INSERT INTO finance_bank_accounts
         (tenant_id,book_id,ledger_account_id,display_name,masked_account_number,currency,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          tenantId,
          rows[0].book_id,
          rows[0].ledger_account_id,
          input.display_name.trim(),
          input.masked_account_number,
          rows[0].base_currency,
          actorId,
        ],
      );
      return inserted[0];
    });
  }

  async importStatement(
    tenantId: string,
    actorId: string,
    key: string,
    input: BankStatementImport,
  ) {
    if (
      !key?.trim() ||
      !validDate(input.period_start) ||
      !validDate(input.period_end) ||
      input.period_start > input.period_end ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        input.source_upload_id ?? '',
      )
    )
      throw new BadRequestException(
        'Invalid statement metadata or upload reference',
      );
    const opening = amount(input.opening_balance);
    const closing = amount(input.closing_balance);
    const payloadHash = hash(input);
    return this.db.transaction(async (tx) => {
      const banks = await tx.query(
        `SELECT ba.bank_account_id,ba.currency,ba.status,b.authority_status
         FROM finance_bank_accounts ba JOIN finance_books b ON b.book_id=ba.book_id
           AND b.tenant_id=ba.tenant_id
         WHERE ba.tenant_id=$1 AND ba.bank_account_id=$2 FOR UPDATE OF ba,b`,
        [tenantId, input.bank_account_id],
      );
      if (!banks[0]) throw new NotFoundException('Bank account not found');
      if (
        banks[0].status !== 'ACTIVE' ||
        banks[0].authority_status === 'PAUSED'
      )
        throw new ConflictException('Bank account or Finance book is paused');
      const uploads = await tx.query(
        `SELECT upload_id,source_sha256,parsed_lines FROM finance_bank_statement_uploads
         WHERE tenant_id=$1 AND bank_account_id=$2 AND upload_id=$3`,
        [tenantId, input.bank_account_id, input.source_upload_id],
      );
      if (!uploads[0])
        throw new NotFoundException('Verified statement upload not found');
      const lines = uploads[0].parsed_lines as StatementLine[];
      if (!Array.isArray(lines) || !lines.length || lines.length > 10000)
        throw new ConflictException('Statement upload has no valid lines');
      let running = opening;
      for (const line of lines) {
        if (
          !validDate(line.transaction_date) ||
          line.transaction_date < input.period_start ||
          line.transaction_date > input.period_end ||
          (line.value_date && !validDate(line.value_date)) ||
          !line.description?.trim()
        )
          throw new BadRequestException(
            'Statement line date or description is invalid',
          );
        const debit = amount(line.debit);
        const credit = amount(line.credit);
        if (!((debit > 0n && credit === 0n) || (credit > 0n && debit === 0n)))
          throw new BadRequestException(
            'A statement line must have exactly one positive side',
          );
        running += credit - debit;
        if (
          line.running_balance !== undefined &&
          amount(line.running_balance) !== running
        )
          throw new BadRequestException(
            'A statement running balance does not reconcile',
          );
      }
      if (running !== closing)
        throw new BadRequestException(
          'Statement opening, movements and closing do not reconcile',
        );
      const existing = await tx.query(
        `SELECT statement_id,payload_hash FROM finance_bank_statements
         WHERE tenant_id=$1 AND bank_account_id=$2 AND idempotency_key=$3`,
        [tenantId, input.bank_account_id, key],
      );
      if (existing[0]) {
        if (existing[0].payload_hash !== payloadHash)
          throw new ConflictException('Statement retry changed its payload');
        return { statement_id: existing[0].statement_id, duplicate: true };
      }
      const duplicateFile = await tx.query(
        `SELECT statement_id FROM finance_bank_statements
         WHERE tenant_id=$1 AND bank_account_id=$2 AND source_sha256=$3`,
        [tenantId, input.bank_account_id, uploads[0].source_sha256],
      );
      if (duplicateFile[0])
        throw new ConflictException('Statement file already imported');
      const overlapping = await tx.query(
        `SELECT statement_id FROM finance_bank_statements
         WHERE tenant_id=$1 AND bank_account_id=$2
           AND period_start<=$4::date AND period_end>=$3::date`,
        [tenantId, input.bank_account_id, input.period_start, input.period_end],
      );
      if (overlapping[0])
        throw new ConflictException(
          'Statement period overlaps an existing import',
        );
      const inserted = await tx.query(
        `INSERT INTO finance_bank_statements
         (tenant_id,bank_account_id,period_start,period_end,opening_balance,closing_balance,
          source_upload_id,source_sha256,idempotency_key,payload_hash,imported_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING statement_id`,
        [
          tenantId,
          input.bank_account_id,
          input.period_start,
          input.period_end,
          money(opening),
          money(closing),
          input.source_upload_id,
          uploads[0].source_sha256,
          key,
          payloadHash,
          actorId,
        ],
      );
      const statementId = inserted[0].statement_id as string;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        await tx.query(
          `INSERT INTO finance_bank_statement_lines
           (tenant_id,statement_id,row_number,transaction_date,value_date,description,
            bank_reference,debit_amount,credit_amount,running_balance)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            tenantId,
            statementId,
            i + 1,
            line.transaction_date,
            line.value_date ?? null,
            line.description.trim(),
            line.bank_reference?.trim() ?? null,
            money(amount(line.debit)),
            money(amount(line.credit)),
            line.running_balance === undefined
              ? null
              : money(amount(line.running_balance)),
          ],
        );
      }
      return { statement_id: statementId, duplicate: false };
    });
  }

  async statements(tenantId: string, bankAccountId: string) {
    return this.db.query(
      `SELECT statement_id,period_start,period_end,opening_balance::text,
              closing_balance::text,status,revision,imported_at
       FROM finance_bank_statements WHERE tenant_id=$1 AND bank_account_id=$2
       ORDER BY period_end DESC LIMIT 100`,
      [tenantId, bankAccountId],
    );
  }

  async statement(tenantId: string, statementId: string) {
    const statements = await this.db.query(
      `SELECT s.*,ba.display_name,ba.masked_account_number
       FROM finance_bank_statements s JOIN finance_bank_accounts ba
         ON ba.bank_account_id=s.bank_account_id AND ba.tenant_id=s.tenant_id
       WHERE s.tenant_id=$1 AND s.statement_id=$2`,
      [tenantId, statementId],
    );
    if (!statements[0]) throw new NotFoundException('Bank statement not found');
    const lines = await this.db.query(
      `SELECT sl.statement_line_id,sl.row_number,sl.transaction_date,sl.value_date,
              sl.description,sl.bank_reference,sl.debit_amount::text AS debit,
              sl.credit_amount::text AS credit,sl.running_balance::text,
              m.match_id,m.status AS match_status,m.journal_line_id,
              m.proposed_by AS match_proposed_by,m.revision AS match_revision
       FROM finance_bank_statement_lines sl
       LEFT JOIN finance_bank_matches m ON m.statement_line_id=sl.statement_line_id
         AND m.status IN ('PROPOSED','APPROVED')
       WHERE sl.tenant_id=$1 AND sl.statement_id=$2 ORDER BY sl.row_number`,
      [tenantId, statementId],
    );
    return { statement: statements[0], lines };
  }

  async sourceEvidence(tenantId: string, statementId: string) {
    const rows = await this.db.query(
      `SELECT u.object_key,u.original_filename,u.source_sha256
       FROM finance_bank_statements s JOIN finance_bank_statement_uploads u
         ON u.upload_id=s.source_upload_id AND u.tenant_id=s.tenant_id
         AND u.bank_account_id=s.bank_account_id
       WHERE s.tenant_id=$1 AND s.statement_id=$2`,
      [tenantId, statementId],
    );
    if (!rows[0]) throw new NotFoundException('Statement evidence not found');
    return {
      stream: await this.storage.getDownloadStream(rows[0].object_key),
      filename: String(rows[0].original_filename).replace(
        /[^A-Za-z0-9._-]/g,
        '_',
      ),
      sha256: rows[0].source_sha256 as string,
    };
  }

  async candidates(tenantId: string, statementId: string) {
    const rows = await this.db.query(
      `SELECT s.statement_id,s.period_start,s.period_end,ba.book_id,ba.ledger_account_id
       FROM finance_bank_statements s JOIN finance_bank_accounts ba
         ON ba.bank_account_id=s.bank_account_id AND ba.tenant_id=s.tenant_id
       WHERE s.tenant_id=$1 AND s.statement_id=$2`,
      [tenantId, statementId],
    );
    if (!rows[0]) throw new NotFoundException('Bank statement not found');
    return this.db.query(
      `SELECT jl.line_id AS journal_line_id,je.journal_entry_id,je.entry_date,
              je.source_type,je.source_id,je.narration,je.book_sequence,
              jl.debit_amount::text AS debit,jl.credit_amount::text AS credit,
              m.match_id,o.outstanding_id,o.status AS outstanding_status,
              o.proposed_by AS outstanding_proposed_by,o.revision AS outstanding_revision
       FROM finance_journal_entries je JOIN finance_journal_lines jl
         ON jl.journal_entry_id=je.journal_entry_id
       LEFT JOIN finance_bank_matches m ON m.journal_line_id=jl.line_id
         AND m.status='APPROVED'
       LEFT JOIN finance_bank_outstanding_items o ON o.journal_line_id=jl.line_id
         AND o.statement_id=$2 AND o.status IN ('PROPOSED','APPROVED')
       WHERE je.tenant_id=$1 AND je.book_id=$3 AND je.posting_status='POSTED'
         AND jl.ledger_account_id=$4
         AND je.entry_date<=$5::date
       ORDER BY je.entry_date,je.book_sequence,jl.line_id LIMIT 10000`,
      [
        tenantId,
        statementId,
        rows[0].book_id,
        rows[0].ledger_account_id,
        rows[0].period_end,
      ],
    );
  }

  async proposeMatch(
    tenantId: string,
    actorId: string,
    key: string,
    statementId: string,
    statementLineId: string,
    journalLineId: string,
    reason: string,
    expectedStatementRevision: number,
  ) {
    if (
      !key?.trim() ||
      !reason?.trim() ||
      !Number.isSafeInteger(expectedStatementRevision)
    )
      throw new BadRequestException(
        'Idempotency key, reason and If-Match are required',
      );
    const payloadHash = hash({ statementLineId, journalLineId, reason });
    return this.db.transaction(async (tx) => {
      const existing = await tx.query(
        `SELECT * FROM finance_bank_matches WHERE tenant_id=$1 AND statement_id=$2 AND idempotency_key=$3`,
        [tenantId, statementId, key],
      );
      if (existing[0]) {
        if (existing[0].payload_hash !== payloadHash)
          throw new ConflictException('Changed match retry');
        return existing[0];
      }
      const rows = await tx.query(
        `SELECT s.status AS statement_status,s.revision AS statement_revision,
                sl.debit_amount AS bank_debit,
                sl.credit_amount AS bank_credit,jl.debit_amount AS ledger_debit,
                jl.credit_amount AS ledger_credit,je.entry_date,s.period_start,s.period_end
         FROM finance_bank_statements s
         JOIN finance_bank_accounts ba ON ba.bank_account_id=s.bank_account_id
           AND ba.tenant_id=s.tenant_id
         JOIN finance_bank_statement_lines sl ON sl.statement_id=s.statement_id
           AND sl.tenant_id=s.tenant_id AND sl.statement_line_id=$3
         JOIN finance_journal_lines jl ON jl.line_id=$4
           AND jl.ledger_account_id=ba.ledger_account_id
         JOIN finance_journal_entries je ON je.journal_entry_id=jl.journal_entry_id
           AND je.tenant_id=s.tenant_id AND je.book_id=ba.book_id
           AND je.posting_status='POSTED'
         WHERE s.tenant_id=$1 AND s.statement_id=$2
         FOR UPDATE OF s,sl`,
        [tenantId, statementId, statementLineId, journalLineId],
      );
      const row = rows[0];
      if (!row)
        throw new NotFoundException(
          'Statement or scoped journal line not found',
        );
      if (
        row.statement_status !== 'REVIEW_PENDING' ||
        Number(row.statement_revision) !== expectedStatementRevision
      )
        throw new ConflictException('Stale bank statement revision');
      if (row.entry_date > row.period_end)
        throw new ConflictException('Journal line is after statement period');
      if (
        amount(String(row.bank_debit)) !== amount(String(row.ledger_credit)) ||
        amount(String(row.bank_credit)) !== amount(String(row.ledger_debit))
      )
        throw new ConflictException(
          'Bank and ledger line amounts or directions differ',
        );
      const inserted = await tx.query(
        `INSERT INTO finance_bank_matches
         (tenant_id,statement_id,statement_line_id,journal_line_id,reason,proposed_by,idempotency_key,payload_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          tenantId,
          statementId,
          statementLineId,
          journalLineId,
          reason.trim(),
          actorId,
          key,
          payloadHash,
        ],
      );
      return inserted[0];
    });
  }

  async reviewMatch(
    tenantId: string,
    actorId: string,
    key: string,
    matchId: string,
    expectedRevision: number,
    approve: boolean,
  ) {
    if (!key?.trim() || !Number.isSafeInteger(expectedRevision))
      throw new BadRequestException(
        'Idempotency key and If-Match revision are required',
      );
    return this.db.transaction(async (tx) => {
      const rows = await tx.query(
        `SELECT m.*,s.status AS statement_status FROM finance_bank_matches m
         JOIN finance_bank_statements s ON s.statement_id=m.statement_id AND s.tenant_id=m.tenant_id
         WHERE m.tenant_id=$1 AND m.match_id=$2 FOR UPDATE OF m,s`,
        [tenantId, matchId],
      );
      const match = rows[0];
      if (!match) throw new NotFoundException('Match not found');
      if (
        match.review_idempotency_key === key &&
        match.reviewed_by === actorId &&
        match.status === (approve ? 'APPROVED' : 'REJECTED')
      )
        return match;
      if (
        match.status !== 'PROPOSED' ||
        Number(match.revision) !== expectedRevision ||
        match.statement_status !== 'REVIEW_PENDING'
      )
        throw new ConflictException('Stale match review');
      if (match.proposed_by === actorId)
        throw new ForbiddenException('Match proposer cannot review');
      if (approve) {
        const alreadyMatched = await tx.query(
          `SELECT match_id FROM finance_bank_matches WHERE journal_line_id=$1 AND status='APPROVED'`,
          [match.journal_line_id],
        );
        if (alreadyMatched[0])
          throw new ConflictException('Journal line is already matched');
        const outstanding = await tx.query(
          `SELECT outstanding_id FROM finance_bank_outstanding_items
           WHERE statement_id=$1 AND journal_line_id=$2 AND status IN ('PROPOSED','APPROVED')`,
          [match.statement_id, match.journal_line_id],
        );
        if (outstanding[0])
          throw new ConflictException(
            'Journal line is marked outstanding for this statement',
          );
      }
      const updated = await tx.query(
        `UPDATE finance_bank_matches SET status=$3,reviewed_by=$4,reviewed_at=NOW(),
                review_idempotency_key=$5,revision=revision+1
         WHERE tenant_id=$1 AND match_id=$2 RETURNING *`,
        [tenantId, matchId, approve ? 'APPROVED' : 'REJECTED', actorId, key],
      );
      return updated[0];
    });
  }

  async proposeOutstanding(
    tenantId: string,
    actorId: string,
    key: string,
    statementId: string,
    journalLineId: string,
    kind: string,
    reason: string,
    expectedStatementRevision: number,
  ) {
    if (
      !key?.trim() ||
      !reason?.trim() ||
      !['DEPOSIT_IN_TRANSIT', 'OUTSTANDING_PAYMENT'].includes(kind) ||
      !Number.isSafeInteger(expectedStatementRevision)
    )
      throw new BadRequestException(
        'Valid outstanding type, reason, key and If-Match are required',
      );
    return this.db.transaction(async (tx) => {
      const existing = await tx.query(
        `SELECT * FROM finance_bank_outstanding_items
         WHERE tenant_id=$1 AND statement_id=$2 AND idempotency_key=$3`,
        [tenantId, statementId, key],
      );
      if (existing[0]) {
        if (
          existing[0].journal_line_id !== journalLineId ||
          existing[0].kind !== kind ||
          existing[0].reason !== reason.trim()
        )
          throw new ConflictException('Changed outstanding-item retry');
        return existing[0];
      }
      const rows = await tx.query(
        `SELECT s.status AS statement_status,s.revision AS statement_revision,
                jl.debit_amount,jl.credit_amount
         FROM finance_bank_statements s JOIN finance_bank_accounts ba
           ON ba.bank_account_id=s.bank_account_id AND ba.tenant_id=s.tenant_id
         JOIN finance_journal_lines jl ON jl.line_id=$3 AND jl.ledger_account_id=ba.ledger_account_id
         JOIN finance_journal_entries je ON je.journal_entry_id=jl.journal_entry_id
           AND je.tenant_id=s.tenant_id AND je.book_id=ba.book_id AND je.posting_status='POSTED'
           AND je.entry_date BETWEEN s.period_start AND s.period_end
         WHERE s.tenant_id=$1 AND s.statement_id=$2 FOR UPDATE OF s`,
        [tenantId, statementId, journalLineId],
      );
      const row = rows[0];
      if (!row)
        throw new NotFoundException('Scoped bank journal line not found');
      if (
        row.statement_status !== 'REVIEW_PENDING' ||
        Number(row.statement_revision) !== expectedStatementRevision
      )
        throw new ConflictException('Stale bank statement revision');
      if (
        (kind === 'DEPOSIT_IN_TRANSIT' &&
          amount(String(row.debit_amount)) <= 0n) ||
        (kind === 'OUTSTANDING_PAYMENT' &&
          amount(String(row.credit_amount)) <= 0n)
      )
        throw new ConflictException(
          'Outstanding type disagrees with ledger direction',
        );
      const matched = await tx.query(
        `SELECT match_id FROM finance_bank_matches WHERE journal_line_id=$1 AND status='APPROVED'`,
        [journalLineId],
      );
      if (matched[0])
        throw new ConflictException('Journal line is already matched');
      const inserted = await tx.query(
        `INSERT INTO finance_bank_outstanding_items
         (tenant_id,statement_id,journal_line_id,kind,reason,proposed_by,idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          tenantId,
          statementId,
          journalLineId,
          kind,
          reason.trim(),
          actorId,
          key,
        ],
      );
      return inserted[0];
    });
  }

  async reviewOutstanding(
    tenantId: string,
    actorId: string,
    key: string,
    outstandingId: string,
    expectedRevision: number,
    approve: boolean,
  ) {
    if (!key?.trim() || !Number.isSafeInteger(expectedRevision))
      throw new BadRequestException(
        'Idempotency key and If-Match revision are required',
      );
    return this.db.transaction(async (tx) => {
      const rows = await tx.query(
        `SELECT o.*,s.status AS statement_status FROM finance_bank_outstanding_items o
         JOIN finance_bank_statements s ON s.statement_id=o.statement_id AND s.tenant_id=o.tenant_id
         WHERE o.tenant_id=$1 AND o.outstanding_id=$2 FOR UPDATE OF o,s`,
        [tenantId, outstandingId],
      );
      const item = rows[0];
      if (!item) throw new NotFoundException('Outstanding item not found');
      if (
        item.review_idempotency_key === key &&
        item.reviewed_by === actorId &&
        item.status === (approve ? 'APPROVED' : 'REJECTED')
      )
        return item;
      if (
        item.status !== 'PROPOSED' ||
        Number(item.revision) !== expectedRevision ||
        item.statement_status !== 'REVIEW_PENDING'
      )
        throw new ConflictException('Stale outstanding-item review');
      if (item.proposed_by === actorId)
        throw new ForbiddenException('Proposer cannot review their own item');
      if (approve) {
        const matched = await tx.query(
          `SELECT match_id FROM finance_bank_matches
           WHERE journal_line_id=$1 AND status='APPROVED'`,
          [item.journal_line_id],
        );
        if (matched[0])
          throw new ConflictException('Journal line has since been matched');
      }
      const updated = await tx.query(
        `UPDATE finance_bank_outstanding_items SET status=$3,reviewed_by=$4,
                reviewed_at=NOW(),review_idempotency_key=$5,revision=revision+1
         WHERE tenant_id=$1 AND outstanding_id=$2 RETURNING *`,
        [
          tenantId,
          outstandingId,
          approve ? 'APPROVED' : 'REJECTED',
          actorId,
          key,
        ],
      );
      return updated[0];
    });
  }

  private async snapshot(
    tx: Pick<DataSource, 'query'>,
    tenantId: string,
    statementId: string,
  ) {
    const rows = await tx.query(
      `SELECT s.*,ba.book_id,ba.ledger_account_id,b.ledger_sequence
       FROM finance_bank_statements s JOIN finance_bank_accounts ba
         ON ba.bank_account_id=s.bank_account_id AND ba.tenant_id=s.tenant_id
       JOIN finance_books b ON b.book_id=ba.book_id AND b.tenant_id=s.tenant_id
       WHERE s.tenant_id=$1 AND s.statement_id=$2`,
      [tenantId, statementId],
    );
    const statement = rows[0];
    if (!statement) throw new NotFoundException('Bank statement not found');
    const statementGaps = await tx.query(
      `SELECT COUNT(*)::integer AS unmatched FROM finance_bank_statement_lines sl
         WHERE sl.tenant_id=$1 AND sl.statement_id=$2 AND NOT EXISTS (
           SELECT 1 FROM finance_bank_matches m WHERE m.statement_line_id=sl.statement_line_id
             AND m.status='APPROVED')`,
      [tenantId, statementId],
    );
    const ledgerItems = await tx.query(
      `SELECT jl.line_id,jl.debit_amount::text AS debit,jl.credit_amount::text AS credit,
                CASE WHEN m.match_id IS NOT NULL THEN 'MATCHED'
                     WHEN o.status='APPROVED' THEN o.kind
                     ELSE 'UNRESOLVED' END AS resolution
         FROM finance_journal_entries je JOIN finance_journal_lines jl
           ON jl.journal_entry_id=je.journal_entry_id
         LEFT JOIN finance_bank_matches m ON m.journal_line_id=jl.line_id AND m.status='APPROVED'
         LEFT JOIN finance_bank_outstanding_items o ON o.journal_line_id=jl.line_id
           AND o.statement_id=$2 AND o.status='APPROVED'
         WHERE je.tenant_id=$1 AND je.book_id=$3 AND je.posting_status='POSTED'
           AND jl.ledger_account_id=$4 AND je.entry_date BETWEEN $5::date AND $6::date
           AND je.book_sequence<=$7::bigint`,
      [
        tenantId,
        statementId,
        statement.book_id,
        statement.ledger_account_id,
        statement.period_start,
        statement.period_end,
        statement.ledger_sequence,
      ],
    );
    const ledgerBalance = await tx.query(
      `SELECT COALESCE(SUM(jl.debit_amount-jl.credit_amount),0)::text AS balance
         FROM finance_journal_entries je JOIN finance_journal_lines jl
           ON jl.journal_entry_id=je.journal_entry_id
         WHERE je.tenant_id=$1 AND je.book_id=$2 AND je.posting_status='POSTED'
           AND jl.ledger_account_id=$3 AND je.entry_date<=$4::date
           AND je.book_sequence<=$5::bigint`,
      [
        tenantId,
        statement.book_id,
        statement.ledger_account_id,
        statement.period_end,
        statement.ledger_sequence,
      ],
    );
    const items = ledgerItems as Array<{
      line_id: string;
      debit: string;
      credit: string;
      resolution: string;
    }>;
    const deposits = items
      .filter((item) => item.resolution === 'DEPOSIT_IN_TRANSIT')
      .reduce((sum, item) => sum + amount(item.debit), 0n);
    const payments = items
      .filter((item) => item.resolution === 'OUTSTANDING_PAYMENT')
      .reduce((sum, item) => sum + amount(item.credit), 0n);
    const bookBalance = amount(String(ledgerBalance[0].balance));
    const adjustedBank =
      amount(String(statement.closing_balance)) + deposits - payments;
    return {
      statement_id: statementId,
      statement_revision: String(statement.revision),
      ledger_revision: String(statement.ledger_sequence),
      bank_closing_balance: money(amount(String(statement.closing_balance))),
      ledger_closing_balance: money(bookBalance),
      outstanding_deposits: money(deposits),
      outstanding_payments: money(payments),
      adjusted_bank_balance: money(adjustedBank),
      difference: money(adjustedBank - bookBalance),
      unmatched_statement_lines: Number(statementGaps[0].unmatched),
      unresolved_ledger_lines: items.filter(
        (item) => item.resolution === 'UNRESOLVED',
      ).length,
      status: statement.status,
    };
  }

  async preview(tenantId: string, statementId: string) {
    return this.snapshot(this.db, tenantId, statementId);
  }

  async finalize(
    tenantId: string,
    actorId: string,
    key: string,
    statementId: string,
    expectedRevision: number,
  ) {
    if (!key?.trim() || !Number.isSafeInteger(expectedRevision))
      throw new BadRequestException(
        'Idempotency key and If-Match revision are required',
      );
    return this.db.transaction(async (tx) => {
      const rows = await tx.query(
        `SELECT s.revision,s.status,s.imported_by,ba.book_id
         FROM finance_bank_statements s JOIN finance_bank_accounts ba
           ON ba.bank_account_id=s.bank_account_id AND ba.tenant_id=s.tenant_id
         WHERE s.tenant_id=$1 AND s.statement_id=$2 FOR UPDATE OF s`,
        [tenantId, statementId],
      );
      const statement = rows[0];
      if (!statement) throw new NotFoundException('Bank statement not found');
      const previous = await tx.query(
        `SELECT * FROM finance_bank_reconciliations WHERE tenant_id=$1 AND statement_id=$2`,
        [tenantId, statementId],
      );
      if (previous[0]) {
        if (previous[0].idempotency_key !== key)
          throw new ConflictException('Reconciliation already approved');
        return previous[0];
      }
      if (
        statement.status !== 'REVIEW_PENDING' ||
        Number(statement.revision) !== expectedRevision
      )
        throw new ConflictException('Stale bank statement revision');
      if (statement.imported_by === actorId)
        throw new ForbiddenException(
          'Statement importer cannot approve reconciliation',
        );
      await tx.query(
        `SELECT book_id FROM finance_books WHERE tenant_id=$1 AND book_id=$2 FOR SHARE`,
        [tenantId, statement.book_id],
      );
      const snapshot = await this.snapshot(tx, tenantId, statementId);
      if (
        snapshot.unmatched_statement_lines !== 0 ||
        snapshot.unresolved_ledger_lines !== 0 ||
        snapshot.difference !== '0.00'
      )
        throw new ConflictException(
          'Statement, ledger and outstanding items are not fully reconciled',
        );
      const matches = await tx.query(
        `SELECT DISTINCT proposed_by FROM finance_bank_matches
         WHERE tenant_id=$1 AND statement_id=$2 AND status='APPROVED'
         UNION SELECT DISTINCT proposed_by FROM finance_bank_outstanding_items
         WHERE tenant_id=$1 AND statement_id=$2 AND status='APPROVED'`,
        [tenantId, statementId],
      );
      if (
        matches.some(
          (row: { proposed_by: string }) => row.proposed_by === actorId,
        )
      )
        throw new ForbiddenException(
          'Match or outstanding-item proposer cannot approve final reconciliation',
        );
      const inserted = await tx.query(
        `INSERT INTO finance_bank_reconciliations
         (tenant_id,statement_id,ledger_revision,ledger_closing_balance,
          adjusted_bank_balance,difference,snapshot_hash,idempotency_key,prepared_by,approved_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          tenantId,
          statementId,
          snapshot.ledger_revision,
          snapshot.ledger_closing_balance,
          snapshot.adjusted_bank_balance,
          snapshot.difference,
          hash(snapshot),
          key,
          statement.imported_by,
          actorId,
        ],
      );
      await tx.query(
        `UPDATE finance_bank_statements SET status='RECONCILED',revision=revision+1
         WHERE tenant_id=$1 AND statement_id=$2`,
        [tenantId, statementId],
      );
      return inserted[0];
    });
  }
}
