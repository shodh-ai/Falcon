import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FinanceService } from '../finance/finance.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { IsbnLookupService } from './isbn-lookup.service';

const RENEWAL_DAYS_STUDENT = 7;
const RENEWAL_DAYS_FACULTY = 30;
const DEFAULT_RULE = {
  role_name: 'Student',
  max_books_allowed: 3,
  max_days_allowed: 14,
  fine_per_day: 10,
};

type BorrowingRule = {
  rule_id: string;
  role_name: string;
  max_books_allowed: number;
  max_days_allowed: number;
  fine_per_day: string | number;
};

@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly finance: FinanceService,
    private readonly notify: NotificationEmitterService,
    private readonly isbnLookup: IsbnLookupService,
  ) {}

  /** Resolve role from primary role_id; map teaching roles to Faculty rules when needed. */
  private async getPatronRoleName(userId: string): Promise<string> {
    const rows = await this.dataSource.query<Array<{ role_name: string }>>(
      `SELECT r.role_name FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1`,
      [userId],
    );
    return rows[0]?.role_name ?? 'Student';
  }

  private ruleRoleKey(roleName: string): string {
    if (['Faculty', 'HOD', 'Dean'].includes(roleName)) return 'Faculty';
    return roleName;
  }

  async getBorrowingRulesForUser(userId: string): Promise<BorrowingRule> {
    const roleName = await this.getPatronRoleName(userId);
    const key = this.ruleRoleKey(roleName);
    const rows = await this.dataSource.query<BorrowingRule[]>(
      `SELECT * FROM lib_borrowing_rules WHERE role_name = $1`,
      [key],
    );
    if (rows[0]) return rows[0];
    const fallback = await this.dataSource.query<BorrowingRule[]>(
      `SELECT * FROM lib_borrowing_rules WHERE role_name = 'Student'`,
    );
    return fallback[0] ?? { ...DEFAULT_RULE, rule_id: '' };
  }

  async getDashboardMetrics(tenantId: string) {
    const [issued, catalog, overdue, gate] = await Promise.all([
      this.dataSource.query(
        `SELECT COUNT(*)::int AS c FROM lib_circulation
         WHERE tenant_id = $1 AND returned_at IS NULL`,
        [tenantId],
      ),
      this.dataSource.query(
        `SELECT COUNT(DISTINCT c.catalog_id)::int AS titles,
                COUNT(ic.copy_id)::int AS copies
         FROM lib_catalog c
         LEFT JOIN lib_inventory_copies ic ON ic.catalog_id = c.catalog_id
         WHERE c.tenant_id = $1`,
        [tenantId],
      ),
      this.dataSource.query(
        `SELECT COUNT(*)::int AS c FROM lib_circulation
         WHERE tenant_id = $1 AND returned_at IS NULL AND due_date < NOW()`,
        [tenantId],
      ),
      this.gateStats(tenantId),
    ]);

    return {
      books_currently_issued: issued[0]?.c ?? 0,
      catalog_titles: catalog[0]?.titles ?? 0,
      total_copies: catalog[0]?.copies ?? 0,
      overdue_loans: overdue[0]?.c ?? 0,
      walk_ins_today: gate.entries_today,
      patrons_inside: gate.currently_inside,
    };
  }

  async exportNaacUtilizationReport(tenantId: string, month?: string) {
    const monthStart = month ?? new Date().toISOString().slice(0, 7);
    const rows = await this.dataSource.query(
      `SELECT u.name, u.official_email, r.role_name,
              COUNT(DISTINCT DATE(v.entered_at))::int AS visit_days,
              COUNT(v.visit_id)::int AS total_entries,
              SUM(EXTRACT(EPOCH FROM (COALESCE(v.exited_at, NOW()) - v.entered_at)) / 3600)::numeric(10,1) AS hours_approx
       FROM lib_gate_visits v
       JOIN users u ON u.user_id = v.user_id
       JOIN roles r ON r.role_id = u.role_id
       WHERE v.tenant_id = $1 AND to_char(v.entered_at, 'YYYY-MM') = $2
       GROUP BY u.user_id, u.name, u.official_email, r.role_name
       ORDER BY total_entries DESC`,
      [tenantId, monthStart],
    );

    const header = 'Name,Email,Role,Visit Days,Total Entries,Hours (approx)\n';
    const body = (rows as Array<Record<string, string | number>>)
      .map(
        (r) =>
          `"${r.name}","${r.official_email}","${r.role_name}",${r.visit_days},${r.total_entries},${r.hours_approx}`,
      )
      .join('\n');

    return {
      month: monthStart,
      row_count: rows.length,
      csv: header + body,
      rows,
    };
  }

  async searchCatalog(tenantId: string, query: string, limit = 24) {
    const q = query.trim();
    if (!q) {
      return this.dataSource.query(
        `SELECT c.catalog_id, c.isbn, c.title, c.author, c.category, c.cover_image_url,
                COUNT(ic.copy_id)::int AS total_copies,
                COUNT(ic.copy_id) FILTER (WHERE ic.status = 'AVAILABLE')::int AS available_copies
         FROM lib_catalog c
         LEFT JOIN lib_inventory_copies ic ON ic.catalog_id = c.catalog_id
         WHERE c.tenant_id = $1
         GROUP BY c.catalog_id
         ORDER BY c.title
         LIMIT $2`,
        [tenantId, limit],
      );
    }

    return this.dataSource.query(
      `SELECT c.catalog_id, c.isbn, c.title, c.author, c.category, c.cover_image_url,
              ts_rank(c.search_vector, plainto_tsquery('english', $2)) AS rank,
              COUNT(ic.copy_id)::int AS total_copies,
              COUNT(ic.copy_id) FILTER (WHERE ic.status = 'AVAILABLE')::int AS available_copies
       FROM lib_catalog c
       LEFT JOIN lib_inventory_copies ic ON ic.catalog_id = c.catalog_id
       WHERE c.tenant_id = $1
         AND (
           c.search_vector @@ plainto_tsquery('english', $2)
           OR c.isbn ILIKE $3
           OR c.title ILIKE $3
           OR c.author ILIKE $3
         )
       GROUP BY c.catalog_id
       ORDER BY rank DESC NULLS LAST, c.title
       LIMIT $4`,
      [tenantId, q, `%${q}%`, limit],
    );
  }

  async getCatalogDetail(tenantId: string, catalogId: string) {
    const catalog = await this.dataSource.query(
      `SELECT * FROM lib_catalog WHERE catalog_id = $1 AND tenant_id = $2`,
      [catalogId, tenantId],
    );
    if (!catalog[0]) throw new NotFoundException('Book not found');

    const copies = await this.dataSource.query(
      `SELECT copy_id, accession_number, shelf_location, status
       FROM lib_inventory_copies WHERE catalog_id = $1 AND tenant_id = $2
       ORDER BY accession_number`,
      [catalogId, tenantId],
    );

    const total = copies.length;
    const available = copies.filter((c: { status: string }) => c.status === 'AVAILABLE').length;
    const shelf =
      copies.find((c: { status: string; shelf_location: string }) => c.status === 'AVAILABLE')
        ?.shelf_location ?? copies[0]?.shelf_location;

    return {
      ...catalog[0],
      copies,
      total_copies: total,
      available_copies: available,
      primary_shelf: shelf,
    };
  }

  async placeHold(tenantId: string, userId: string, catalogId: string) {
    const detail = await this.getCatalogDetail(tenantId, catalogId);
    if (detail.available_copies > 0) {
      throw new BadRequestException('Copies are available — visit the desk to issue instead of placing a hold.');
    }

    const existing = await this.dataSource.query(
      `SELECT reservation_id FROM lib_reservations
       WHERE tenant_id = $1 AND catalog_id = $2 AND user_id = $3 AND status IN ('WAITING', 'READY_FOR_PICKUP')`,
      [tenantId, catalogId, userId],
    );
    if (existing[0]) throw new BadRequestException('You already have a hold on this title.');

    const posRows = await this.dataSource.query(
      `SELECT COALESCE(MAX(queue_position), 0) + 1 AS next_pos
       FROM lib_reservations WHERE catalog_id = $1 AND status = 'WAITING'`,
      [catalogId],
    );

    const rows = await this.dataSource.query(
      `INSERT INTO lib_reservations (tenant_id, catalog_id, user_id, queue_position, status)
       VALUES ($1, $2, $3, $4, 'WAITING')
       RETURNING *`,
      [tenantId, catalogId, userId, posRows[0].next_pos],
    );
    return rows[0];
  }

  async getMyAccount(tenantId: string, userId: string) {
    const active = await this.dataSource.query(
      `SELECT t.transaction_id, t.due_date, t.issued_at, t.renewed_count, t.fine_amount,
              c.title, c.author, c.cover_image_url, ic.accession_number, ic.shelf_location
       FROM lib_circulation t
       JOIN lib_inventory_copies ic ON ic.copy_id = t.copy_id
       JOIN lib_catalog c ON c.catalog_id = ic.catalog_id
       WHERE t.tenant_id = $1 AND t.user_id = $2 AND t.returned_at IS NULL
       ORDER BY t.due_date`,
      [tenantId, userId],
    );

    const history = await this.dataSource.query(
      `SELECT t.transaction_id, t.issued_at, t.due_date, t.returned_at, t.fine_amount,
              c.title, c.author
       FROM lib_circulation t
       JOIN lib_inventory_copies ic ON ic.copy_id = t.copy_id
       JOIN lib_catalog c ON c.catalog_id = ic.catalog_id
       WHERE t.tenant_id = $1 AND t.user_id = $2 AND t.returned_at IS NOT NULL
       ORDER BY t.returned_at DESC
       LIMIT 20`,
      [tenantId, userId],
    );

    const holds = await this.dataSource.query(
      `SELECT r.*, c.title, c.author
       FROM lib_reservations r
       JOIN lib_catalog c ON c.catalog_id = r.catalog_id
       WHERE r.tenant_id = $1 AND r.user_id = $2 AND r.status IN ('WAITING', 'READY_FOR_PICKUP')
       ORDER BY r.queue_position`,
      [tenantId, userId],
    );

    const dues = await this.dataSource.query(
      `SELECT demand_id, fee_head, total_amount, paid_amount, status, due_date
       FROM finance_fee_demands
       WHERE student_user_id = $1 AND fee_head ILIKE '%library%'
       ORDER BY due_date DESC`,
      [userId],
    );

    const privileges = await this.getBorrowingRulesForUser(userId);
    const roleName = await this.getPatronRoleName(userId);

    return {
      active_loans: active,
      history,
      holds,
      library_dues: dues,
      patron_role: roleName,
      borrowing_privileges: {
        max_books: privileges.max_books_allowed,
        max_days: privileges.max_days_allowed,
        fine_per_day: Number(privileges.fine_per_day),
        label:
          privileges.max_days_allowed >= 90
            ? 'Faculty loan — due end of semester'
            : `${privileges.max_days_allowed}-day loan`,
      },
    };
  }

  async renewLoan(tenantId: string, userId: string, transactionId: string) {
    const rows = await this.dataSource.query(
      `SELECT t.*, ic.catalog_id, c.title
       FROM lib_circulation t
       JOIN lib_inventory_copies ic ON ic.copy_id = t.copy_id
       JOIN lib_catalog c ON c.catalog_id = ic.catalog_id
       WHERE t.transaction_id = $1 AND t.tenant_id = $2 AND t.user_id = $3 AND t.returned_at IS NULL`,
      [transactionId, tenantId, userId],
    );
    const loan = rows[0];
    if (!loan) throw new NotFoundException('Active loan not found');
    if (loan.renewed_count >= 2) throw new BadRequestException('Maximum renewals reached');

    const waitingHolds = await this.dataSource.query(
      `SELECT 1 FROM lib_reservations
       WHERE catalog_id = $1 AND status IN ('WAITING', 'READY_FOR_PICKUP')
         AND user_id <> $2 LIMIT 1`,
      [loan.catalog_id, userId],
    );
    if (waitingHolds[0]) {
      throw new BadRequestException('Another patron has placed a hold — renewal blocked.');
    }

    const rules = await this.getBorrowingRulesForUser(userId);
    const renewalDays =
      rules.max_days_allowed >= 90 ? RENEWAL_DAYS_FACULTY : RENEWAL_DAYS_STUDENT;
    const newDue = new Date(loan.due_date);
    newDue.setDate(newDue.getDate() + renewalDays);

    const updated = await this.dataSource.query(
      `UPDATE lib_circulation
       SET due_date = $2, renewed_count = renewed_count + 1
       WHERE transaction_id = $1
       RETURNING *`,
      [transactionId, newDue.toISOString()],
    );
    return { loan: updated[0], message: `Due date extended to ${newDue.toISOString().slice(0, 10)}` };
  }

  listDigitalResources(tenantId: string) {
    return this.dataSource.query(
      `SELECT * FROM lib_digital_resources WHERE tenant_id = $1 AND is_active = true ORDER BY title`,
      [tenantId],
    );
  }

  async lookupIsbn(isbn: string) {
    return this.isbnLookup.lookup(isbn);
  }

  async saveCatalogWithCopies(
    tenantId: string,
    dto: {
      isbn?: string;
      title: string;
      author: string;
      publisher?: string;
      edition?: string;
      category?: string;
      synopsis?: string;
      cover_image_url?: string;
      copies: Array<{ accession_number: string; shelf_location: string }>;
    },
  ) {
    const catRows = await this.dataSource.query(
      `INSERT INTO lib_catalog (tenant_id, isbn, title, author, publisher, edition, category, synopsis, cover_image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (tenant_id, isbn) DO UPDATE SET
         title = EXCLUDED.title, author = EXCLUDED.author, publisher = EXCLUDED.publisher,
         edition = EXCLUDED.edition, category = EXCLUDED.category, synopsis = EXCLUDED.synopsis,
         cover_image_url = EXCLUDED.cover_image_url
       RETURNING *`,
      [
        tenantId,
        dto.isbn ?? null,
        dto.title,
        dto.author,
        dto.publisher ?? null,
        dto.edition ?? null,
        dto.category ?? null,
        dto.synopsis ?? null,
        dto.cover_image_url ?? null,
      ],
    );
    const catalog = catRows[0];

    for (const copy of dto.copies) {
      await this.dataSource.query(
        `INSERT INTO lib_inventory_copies (tenant_id, catalog_id, accession_number, shelf_location, status)
         VALUES ($1, $2, $3, $4, 'AVAILABLE')
         ON CONFLICT (tenant_id, accession_number) DO UPDATE SET shelf_location = EXCLUDED.shelf_location`,
        [tenantId, catalog.catalog_id, copy.accession_number, copy.shelf_location],
      );
    }

    return this.getCatalogDetail(tenantId, catalog.catalog_id);
  }

  async resolveUserByBarcode(tenantId: string, barcode: string) {
    const trimmed = barcode.trim();
    const rows = await this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email, r.role_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1
         AND (u.user_id::text = $2 OR lower(u.official_email) = lower($2) OR u.user_id::text = replace($2, 'STU-', ''))
       LIMIT 1`,
      [tenantId, trimmed],
    );
    if (!rows[0]) throw new NotFoundException('Patron not found — scan student/faculty ID');

    const rules = await this.getBorrowingRulesForUser(rows[0].user_id);
    const activeCount = await this.dataSource.query(
      `SELECT COUNT(*)::int AS c FROM lib_circulation WHERE user_id = $1 AND returned_at IS NULL`,
      [rows[0].user_id],
    );

    return {
      ...rows[0],
      borrowing_rules: {
        max_books_allowed: rules.max_books_allowed,
        max_days_allowed: rules.max_days_allowed,
        fine_per_day: Number(rules.fine_per_day),
      },
      currently_issued: Number(activeCount[0]?.c ?? 0),
    };
  }

  async issueCopy(tenantId: string, userId: string, accessionNumber: string, librarianId: string) {
    const copyRows = await this.dataSource.query(
      `SELECT ic.*, c.title FROM lib_inventory_copies ic
       JOIN lib_catalog c ON c.catalog_id = ic.catalog_id
       WHERE ic.tenant_id = $1 AND ic.accession_number = $2`,
      [tenantId, accessionNumber.trim()],
    );
    const copy = copyRows[0];
    if (!copy) throw new NotFoundException('Book barcode not found');
    if (copy.status !== 'AVAILABLE') throw new BadRequestException(`Copy status: ${copy.status}`);

    const userRole = await this.getPatronRoleName(userId);
    const rules = await this.getBorrowingRulesForUser(userId);

    const activeCount = await this.dataSource.query(
      `SELECT COUNT(*)::int AS c FROM lib_circulation
       WHERE user_id = $1 AND returned_at IS NULL`,
      [userId],
    );
    const currentlyIssued = Number(activeCount[0]?.c ?? 0);
    if (currentlyIssued >= rules.max_books_allowed) {
      throw new BadRequestException(
        `Limit reached. ${userRole}s can only issue ${rules.max_books_allowed} books.`,
      );
    }

    const due = new Date();
    due.setDate(due.getDate() + rules.max_days_allowed);

    const txn = await this.dataSource.query(
      `INSERT INTO lib_circulation (tenant_id, copy_id, user_id, due_date)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tenantId, copy.copy_id, userId, due.toISOString()],
    );

    await this.dataSource.query(
      `UPDATE lib_inventory_copies SET status = 'ISSUED' WHERE copy_id = $1`,
      [copy.copy_id],
    );

    this.logger.log(`Issued ${accessionNumber} to ${userId} by librarian ${librarianId}`);
    return {
      transaction: txn[0],
      book_title: copy.title,
      due_date: due,
      patron_role: userRole,
      rules_applied: {
        max_books_allowed: rules.max_books_allowed,
        max_days_allowed: rules.max_days_allowed,
      },
    };
  }

  async returnCopy(tenantId: string, accessionNumber: string) {
    const copyRows = await this.dataSource.query(
      `SELECT ic.*, c.catalog_id, c.title FROM lib_inventory_copies ic
       JOIN lib_catalog c ON c.catalog_id = ic.catalog_id
       WHERE ic.tenant_id = $1 AND ic.accession_number = $2`,
      [tenantId, accessionNumber.trim()],
    );
    const copy = copyRows[0];
    if (!copy) throw new NotFoundException('Book barcode not found');

    const loanRows = await this.dataSource.query(
      `SELECT * FROM lib_circulation
       WHERE copy_id = $1 AND returned_at IS NULL ORDER BY issued_at DESC LIMIT 1`,
      [copy.copy_id],
    );
    const loan = loanRows[0];
    if (!loan) throw new BadRequestException('No active loan on this copy');

    const now = new Date();
    const due = new Date(loan.due_date);
    const rules = await this.getBorrowingRulesForUser(loan.user_id);
    const finePerDay = Number(rules.fine_per_day);
    let fine = Number(loan.fine_amount ?? 0);
    if (now > due && finePerDay > 0) {
      const daysLate = Math.ceil((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      fine = Math.max(fine, daysLate * finePerDay);
    }

    const updated = await this.dataSource.query(
      `UPDATE lib_circulation
       SET returned_at = NOW(), fine_amount = $2
       WHERE transaction_id = $1 RETURNING *`,
      [loan.transaction_id, fine],
    );

    await this.dataSource.query(
      `UPDATE lib_inventory_copies SET status = 'AVAILABLE' WHERE copy_id = $1`,
      [copy.copy_id],
    );

    await this.fulfillNextReservation(tenantId, copy.catalog_id, copy.title);

    return {
      transaction: updated[0],
      book_title: copy.title,
      fine_amount: fine,
      days_late: now > due ? Math.ceil((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)) : 0,
    };
  }

  private async fulfillNextReservation(tenantId: string, catalogId: string, bookTitle: string) {
    const next = await this.dataSource.query(
      `SELECT r.*, u.name FROM lib_reservations r
       JOIN users u ON u.user_id = r.user_id
       WHERE r.catalog_id = $1 AND r.status = 'WAITING'
       ORDER BY r.queue_position ASC LIMIT 1`,
      [catalogId],
    );
    if (!next[0]) return;

    await this.dataSource.query(
      `UPDATE lib_reservations SET status = 'READY_FOR_PICKUP', notified_at = NOW()
       WHERE reservation_id = $1`,
      [next[0].reservation_id],
    );

    this.notify.reservationReady({
      tenantId,
      userId: next[0].user_id,
      bookTitle,
    });
  }

  async listDefaulters(tenantId: string) {
    return this.dataSource.query(
      `SELECT t.transaction_id, t.due_date, t.fine_amount, t.fine_pushed_to_finance,
              u.name, u.official_email, c.title, ic.accession_number,
              EXTRACT(DAY FROM NOW() - t.due_date)::int AS days_overdue
       FROM lib_circulation t
       JOIN users u ON u.user_id = t.user_id
       JOIN lib_inventory_copies ic ON ic.copy_id = t.copy_id
       JOIN lib_catalog c ON c.catalog_id = ic.catalog_id
       WHERE t.tenant_id = $1 AND t.returned_at IS NULL AND t.due_date < NOW()
       ORDER BY t.due_date ASC`,
      [tenantId],
    );
  }

  async pushFineToFinance(tenantId: string, transactionId: string) {
    const rows = await this.dataSource.query(
      `SELECT t.*, c.title, u.user_id AS student_id
       FROM lib_circulation t
       JOIN lib_inventory_copies ic ON ic.copy_id = t.copy_id
       JOIN lib_catalog c ON c.catalog_id = ic.catalog_id
       JOIN users u ON u.user_id = t.user_id
       WHERE t.transaction_id = $1 AND t.tenant_id = $2`,
      [transactionId, tenantId],
    );
    const loan = rows[0];
    if (!loan) throw new NotFoundException('Transaction not found');

    const fine = Number(loan.fine_amount ?? 0);
    if (fine <= 0) throw new BadRequestException('No fine to push');
    if (loan.fine_pushed_to_finance) throw new BadRequestException('Fine already pushed to finance');

    const dueDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10);
    const demand = await this.finance.createDemand(
      {
        student_user_id: loan.student_id,
        fee_head: 'LIBRARY_FINE',
        academic_year: '2026-27',
        total_amount: fine,
        due_date: dueDate,
        fee_breakup: { book_title: loan.title, transaction_id: transactionId },
      },
      tenantId,
    );

    await this.dataSource.query(
      `UPDATE lib_circulation SET fine_pushed_to_finance = true, fee_demand_id = $2 WHERE transaction_id = $1`,
      [transactionId, demand.demand_id],
    );

    return { demand, message: `Library fine ₹${fine} posted to student account` };
  }

  async gateCheckIn(tenantId: string, userId: string) {
    const open = await this.dataSource.query(
      `SELECT visit_id FROM lib_gate_visits WHERE tenant_id = $1 AND user_id = $2 AND exited_at IS NULL`,
      [tenantId, userId],
    );
    if (open[0]) return { visit: open[0], already_inside: true };

    const rows = await this.dataSource.query(
      `INSERT INTO lib_gate_visits (tenant_id, user_id) VALUES ($1, $2) RETURNING *`,
      [tenantId, userId],
    );
    return { visit: rows[0], already_inside: false };
  }

  async gateCheckOut(tenantId: string, userId: string) {
    const rows = await this.dataSource.query(
      `UPDATE lib_gate_visits SET exited_at = NOW()
       WHERE tenant_id = $1 AND user_id = $2 AND exited_at IS NULL
       RETURNING *`,
      [tenantId, userId],
    );
    if (!rows[0]) throw new BadRequestException('No open visit found');
    return rows[0];
  }

  async gateStats(tenantId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const inside = await this.dataSource.query(
      `SELECT COUNT(*)::int AS c FROM lib_gate_visits WHERE tenant_id = $1 AND exited_at IS NULL`,
      [tenantId],
    );
    const todayVisits = await this.dataSource.query(
      `SELECT COUNT(*)::int AS entries
       FROM lib_gate_visits WHERE tenant_id = $1 AND DATE(entered_at) = $2`,
      [tenantId, today],
    );
    return { currently_inside: inside[0]?.c ?? 0, entries_today: todayVisits[0]?.entries ?? 0 };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async scanOverdueLoans() {
    this.logger.log('Running library overdue scanner');

    const overdue = await this.dataSource.query(
      `SELECT t.transaction_id, t.tenant_id, t.user_id, t.due_date, t.fine_amount,
              c.title, u.name
       FROM lib_circulation t
       JOIN lib_inventory_copies ic ON ic.copy_id = t.copy_id
       JOIN lib_catalog c ON c.catalog_id = ic.catalog_id
       JOIN users u ON u.user_id = t.user_id
       WHERE t.returned_at IS NULL AND t.due_date < NOW()`,
    );

    for (const loan of overdue as Array<{
      transaction_id: string;
      tenant_id: string;
      user_id: string;
      due_date: string;
      fine_amount: string;
      title: string;
    }>) {
      const rules = await this.getBorrowingRulesForUser(loan.user_id);
      const finePerDay = Number(rules.fine_per_day);
      const daysLate = Math.ceil(
        (Date.now() - new Date(loan.due_date).getTime()) / (1000 * 60 * 60 * 24),
      );
      const fine = finePerDay > 0 ? daysLate * finePerDay : 0;

      await this.dataSource.query(
        `UPDATE lib_circulation SET fine_amount = $2 WHERE transaction_id = $1`,
        [loan.transaction_id, fine],
      );

      if (finePerDay <= 0) continue;

      this.notify.libraryOverdue({
        tenantId: loan.tenant_id,
        userId: loan.user_id,
        bookTitle: loan.title,
        dueDate: String(loan.due_date).slice(0, 10),
        title: 'Library overdue notice',
        message: `Warning: Return "${loan.title}" today to avoid further fines (₹${fine} accrued).`,
        actionLink: '/student/library',
      });
    }

    return { processed: overdue.length };
  }
}
