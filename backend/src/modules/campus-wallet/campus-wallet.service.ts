import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, QueryRunner } from 'typeorm';

const MEAL_CUTOFFS: Record<
  string,
  { hour: number; minute: number; label: string }
> = {
  BREAKFAST: { hour: 7, minute: 0, label: '7:00 AM' },
  LUNCH: { hour: 10, minute: 0, label: '10:00 AM' },
  DINNER: { hour: 17, minute: 0, label: '5:00 PM' },
};

const MAX_ADVANCE_DAYS = 3;

@Injectable()
export class CampusWalletService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getOrCreateWallet(tenantId: string, studentUserId: string) {
    let rows = await this.dataSource.query(
      `SELECT * FROM campus_wallets WHERE tenant_id = $1 AND student_user_id = $2`,
      [tenantId, studentUserId],
    );
    if (!rows[0]) {
      rows = await this.dataSource.query(
        `INSERT INTO campus_wallets (tenant_id, student_user_id) VALUES ($1, $2) RETURNING *`,
        [tenantId, studentUserId],
      );
    }
    return rows[0];
  }

  async topUp(
    tenantId: string,
    studentUserId: string,
    amount: number,
    referenceId: string,
  ) {
    if (amount <= 0) throw new BadRequestException('Invalid amount');
    const wallet = await this.getOrCreateWallet(tenantId, studentUserId);
    const newBalance = Number(wallet.current_balance) + amount;
    await this.dataSource.query(
      `UPDATE campus_wallets SET current_balance = $2, last_updated = NOW() WHERE wallet_id = $1`,
      [wallet.wallet_id, newBalance],
    );
    await this.dataSource.query(
      `INSERT INTO campus_wallet_ledger (wallet_id, entry_type, amount, balance_after, reference_id, note)
       VALUES ($1, 'TOP_UP', $2, $3, $4, 'Wallet top-up via UPI')`,
      [wallet.wallet_id, amount, newBalance, referenceId],
    );
    return { wallet_id: wallet.wallet_id, current_balance: newBalance };
  }

  getLedger(tenantId: string, studentUserId: string) {
    return this.dataSource.query(
      `SELECT l.ledger_id, l.entry_type, l.amount, l.balance_after, l.reference_id, l.note, l.created_at
       FROM campus_wallet_ledger l
       JOIN campus_wallets w ON w.wallet_id = l.wallet_id
       WHERE w.tenant_id = $1 AND w.student_user_id = $2
       ORDER BY l.created_at DESC
       LIMIT 50`,
      [tenantId, studentUserId],
    );
  }

  listCatalog(tenantId: string) {
    return this.dataSource.query(
      `SELECT * FROM mess_addon_catalog WHERE tenant_id = $1 AND is_active = true ORDER BY meal_type, item_name`,
      [tenantId],
    );
  }

  async getDailyMenu(tenantId: string, dateStr: string) {
    const date = new Date(`${dateStr}T12:00:00`);
    const dayNames = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ];
    const dayKey = dayNames[date.getDay()];

    const rows = await this.dataSource.query(
      `SELECT meal_plan, alternative_options, special_notes FROM operations_mess_menus
       WHERE tenant_id = $1 AND week_start_date <= $2::date AND week_end_date >= $2::date
       ORDER BY week_start_date DESC LIMIT 1`,
      [tenantId, dateStr],
    );

    const menu = rows[0] as
      | {
          meal_plan: Record<string, Record<string, string>>;
          alternative_options?: string;
          special_notes?: string;
        }
      | undefined;
    const dayPlan = menu?.meal_plan?.[dayKey] ?? {};

    return {
      date: dateStr,
      day: dayKey,
      meals: {
        BREAKFAST: this.parseMenuItems(dayPlan.breakfast),
        LUNCH: this.parseMenuItems(dayPlan.lunch),
        DINNER: this.parseMenuItems(dayPlan.dinner),
      },
      alternative_options: menu?.alternative_options ?? null,
      special_notes: menu?.special_notes ?? null,
      cutoffs: Object.fromEntries(
        Object.entries(MEAL_CUTOFFS).map(([meal, cfg]) => [
          meal,
          { time: cfg.label, passed: this.isCutoffPassed(dateStr, meal) },
        ]),
      ),
    };
  }

  getOrderWindow() {
    const dates: { date: string; label: string }[] = [];
    const today = new Date();
    for (let i = 0; i < MAX_ADVANCE_DAYS; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const date = d.toISOString().slice(0, 10);
      const label =
        i === 0
          ? 'Today'
          : i === 1
            ? 'Tomorrow'
            : d.toLocaleDateString('en-IN', { weekday: 'long' });
      dates.push({ date, label });
    }
    return { max_advance_days: MAX_ADVANCE_DAYS, dates, cutoffs: MEAL_CUTOFFS };
  }

  async preOrderAddon(
    tenantId: string,
    studentUserId: string,
    dto: { item_id: string; order_date: string; meal_type: string },
  ) {
    return this.placeOrder(tenantId, studentUserId, {
      order_date: dto.order_date,
      items: [{ item_id: dto.item_id, meal_type: dto.meal_type, quantity: 1 }],
    });
  }

  async placeOrder(
    tenantId: string,
    studentUserId: string,
    dto: {
      order_date: string;
      items: { item_id: string; meal_type: string; quantity?: number }[];
    },
  ) {
    if (!dto.items?.length) throw new BadRequestException('Cart is empty');
    this.assertAdvanceWindow(dto.order_date);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const walletRows = await qr.query(
        `SELECT * FROM campus_wallets WHERE tenant_id = $1 AND student_user_id = $2 FOR UPDATE`,
        [tenantId, studentUserId],
      );
      let wallet = walletRows[0];
      if (!wallet) {
        const created = await qr.query(
          `INSERT INTO campus_wallets (tenant_id, student_user_id) VALUES ($1, $2) RETURNING *`,
          [tenantId, studentUserId],
        );
        wallet = created[0];
      }

      let total = 0;
      const lines: {
        item: { item_id: string; item_name: string; price: string };
        qty: number;
        meal_type: string;
      }[] = [];

      for (const line of dto.items) {
        this.assertNotPastCutoff(dto.order_date, line.meal_type);
        const itemRows = await qr.query(
          `SELECT * FROM mess_addon_catalog WHERE item_id = $1 AND tenant_id = $2 AND is_active = true`,
          [line.item_id, tenantId],
        );
        const item = itemRows[0];
        if (!item)
          throw new BadRequestException(`Item not found: ${line.item_id}`);
        const qty = Math.max(1, line.quantity ?? 1);
        total += Number(item.price) * qty;
        lines.push({ item, qty, meal_type: line.meal_type.toUpperCase() });
      }

      if (Number(wallet.current_balance) < total) {
        throw new BadRequestException('Insufficient wallet balance');
      }

      let newBalance = Number(wallet.current_balance);
      const orders: unknown[] = [];

      for (const { item, qty, meal_type } of lines) {
        for (let i = 0; i < qty; i++) {
          const price = Number(item.price);
          newBalance -= price;
          const orderIdRows = await qr.query(`SELECT gen_random_uuid() AS id`);
          const orderId = orderIdRows[0].id as string;
          const ticket = await this.createUniqueTicket(qr, orderId);
          const orderRows = await qr.query(
            `INSERT INTO mess_addon_orders (
               order_id, tenant_id, student_user_id, item_id, item_name, amount_deducted,
               order_date, meal_type, claim_pin, static_qr_data
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [
              orderId,
              tenantId,
              studentUserId,
              item.item_id,
              item.item_name,
              price,
              dto.order_date,
              meal_type,
              ticket.claim_pin,
              ticket.static_qr_data,
            ],
          );
          orders.push(orderRows[0]);
          await qr.query(
            `INSERT INTO campus_wallet_ledger (wallet_id, entry_type, amount, balance_after, reference_id, note)
             VALUES ($1, 'MESS_DEBIT', $2, $3, $4, $5)`,
            [
              wallet.wallet_id,
              -price,
              newBalance,
              orderRows[0].order_id,
              `${item.item_name} (${meal_type}, ${dto.order_date})`,
            ],
          );
        }
      }

      await qr.query(
        `UPDATE campus_wallets SET current_balance = $2, last_updated = NOW() WHERE wallet_id = $1`,
        [wallet.wallet_id, newBalance],
      );

      await qr.commitTransaction();
      return { orders, total_deducted: total, new_balance: newBalance };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  createWalletTopUpOrder(
    tenantId: string,
    studentUserId: string,
    amount: number,
  ) {
    if (amount <= 0 || amount > 50_000)
      throw new BadRequestException('Invalid top-up amount');
    const orderId = `wallet_${studentUserId.replace(/-/g, '').slice(0, 8)}_${Date.now()}`;
    return {
      order_id: orderId,
      amount_inr: amount,
      amount_paise: Math.round(amount * 100),
      currency: 'INR',
      fee_head: 'WALLET_TOPUP',
      razorpay_key: process.env.RAZORPAY_KEY_ID ?? 'rzp_test_FALCON_CAMPUS',
      mock: true,
      notes: {
        student_user_id: studentUserId,
        tenant_id: tenantId,
        fee_head: 'WALLET_TOPUP',
      },
    };
  }

  async confirmWalletTopUpMock(
    tenantId: string,
    studentUserId: string,
    amount: number,
    paymentId?: string,
  ) {
    const ref = paymentId ?? `mock_wallet_${Date.now()}`;
    return this.topUp(tenantId, studentUserId, amount, ref);
  }

  async generateMealToken(tenantId: string, studentUserId: string) {
    const nonce = randomBytes(16).toString('hex');
    const tokenHash = createHash('sha256')
      .update(`${studentUserId}:${nonce}:${Date.now()}`)
      .digest('hex');
    const totp = this.generateTotp(studentUserId);
    const expiresAt = new Date(Date.now() + 30_000);
    await this.dataSource.query(
      `INSERT INTO mess_meal_tokens (tenant_id, student_user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [tenantId, studentUserId, tokenHash, expiresAt.toISOString()],
    );
    return {
      qr_payload: `${studentUserId}:${tokenHash}:${totp}`,
      expires_at: expiresAt,
      refresh_in_seconds: 30,
      purpose: 'MASTER_MEAL_PASS',
      hint: 'Identity check for standard breakfast, lunch, or dinner buffet entry only.',
    };
  }

  listMyOrders(tenantId: string, studentUserId: string, unredeemedOnly = true) {
    const filter = unredeemedOnly ? 'AND o.is_redeemed = false' : '';
    return this.dataSource.query(
      `SELECT o.order_id, o.item_name, o.amount_deducted, o.order_date, o.meal_type,
              o.claim_pin, o.static_qr_data, o.is_redeemed, o.redeemed_at, o.created_at
       FROM mess_addon_orders o
       WHERE o.tenant_id = $1 AND o.student_user_id = $2 ${filter}
       ORDER BY o.is_redeemed ASC, o.order_date ASC, o.created_at ASC`,
      [tenantId, studentUserId],
    );
  }

  async redeemOrder(tenantId: string, claimPinOrQrData: string) {
    const input = claimPinOrQrData.trim().replace(/^#/, '');
    if (!input)
      throw new BadRequestException('Enter a claim PIN or scan the order QR');

    const rows = await this.dataSource.query(
      `SELECT o.*, u.name AS student_name
       FROM mess_addon_orders o
       JOIN users u ON u.user_id = o.student_user_id
       WHERE o.tenant_id = $1 AND (o.claim_pin = $2 OR o.static_qr_data = $2)
       LIMIT 1`,
      [tenantId, input],
    );
    const order = rows[0] as
      | {
          order_id: string;
          item_name: string;
          student_name: string;
          meal_type: string;
          order_date: string;
          is_redeemed: boolean;
        }
      | undefined;

    if (!order) throw new NotFoundException('Invalid Order.');
    if (order.is_redeemed)
      throw new BadRequestException('This order has already been claimed!');

    await this.dataSource.query(
      `UPDATE mess_addon_orders SET is_redeemed = true, redeemed_at = NOW() WHERE order_id = $1`,
      [order.order_id],
    );

    return {
      message: `Success! Serve 1x ${order.item_name} to ${order.student_name}`,
      item_name: order.item_name,
      student_name: order.student_name,
      meal_type: order.meal_type,
      order_date: order.order_date,
      status: 'GREEN',
      burned: true,
    };
  }

  async scanMealToken(tenantId: string, qrPayload: string) {
    const parts = qrPayload.split(':');
    const studentUserId = parts[0];
    const tokenHash = parts[1];
    const totp = parts[2];
    if (!studentUserId || !tokenHash)
      throw new BadRequestException('Invalid QR');
    if (totp && !this.validateTotp(studentUserId, totp)) {
      throw new BadRequestException(
        'QR security code expired — ask student to refresh',
      );
    }

    const tokenRows = await this.dataSource.query(
      `SELECT * FROM mess_meal_tokens
       WHERE tenant_id = $1 AND student_user_id = $2 AND token_hash = $3 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, studentUserId, tokenHash],
    );
    if (!tokenRows[0]) throw new BadRequestException('QR expired or invalid');

    const allocationRows = await this.dataSource.query(
      `SELECT a.allocation_id, r.room_number, r.hostel_block
       FROM hostel_allocations a
       JOIN hostel_rooms r ON r.room_id = a.room_id
       WHERE a.student_user_id = $1 AND a.status = 'ACTIVE'
       ORDER BY a.updated_at DESC LIMIT 1`,
      [studentUserId],
    );
    if (!allocationRows[0]) {
      throw new BadRequestException(
        'No active hostel allocation — buffet entry denied',
      );
    }

    const mealType = this.inferCurrentMealType();
    if (!mealType) {
      throw new BadRequestException(
        'Mess is not serving right now — try during meal hours',
      );
    }

    const existingEntry = await this.dataSource.query(
      `SELECT entry_id FROM mess_meal_entries
       WHERE tenant_id = $1 AND student_user_id = $2 AND meal_type = $3 AND entry_date = CURRENT_DATE`,
      [tenantId, studentUserId, mealType],
    );
    if (existingEntry[0]) {
      throw new BadRequestException(
        `Already checked in for ${mealType.toLowerCase()} today`,
      );
    }

    await this.dataSource.query(
      `INSERT INTO mess_meal_entries (tenant_id, student_user_id, meal_type, entry_date)
       VALUES ($1, $2, $3, CURRENT_DATE)`,
      [tenantId, studentUserId, mealType],
    );

    const studentRows = await this.dataSource.query(
      `SELECT name FROM users WHERE user_id = $1`,
      [studentUserId],
    );
    const room = allocationRows[0] as {
      room_number?: string;
      hostel_block?: string;
    };
    const roomLabel = room?.room_number ? `Room ${room.room_number}` : null;
    const studentName = studentRows[0]?.name ?? 'Student';

    return {
      valid: true,
      pass_type: 'MASTER_MEAL_PASS',
      student_name: studentName,
      room: roomLabel,
      meal_type: mealType,
      base_meal: 'Standard hostel buffet included in mess fee',
      display_line: `${studentName}${roomLabel ? ` — ${roomLabel}` : ''}. ${mealType} ENTRY — Standard buffet`,
      status: 'GREEN',
    };
  }

  private async createUniqueTicket(
    qr: QueryRunner,
    orderId: string,
  ): Promise<{ claim_pin: string; static_qr_data: string }> {
    const static_qr_data = `FALCON:ORDER:${orderId}`;
    for (let attempt = 0; attempt < 15; attempt++) {
      const claim_pin = String(Math.floor(1000 + Math.random() * 9000));
      const existing = await qr.query(
        `SELECT 1 FROM mess_addon_orders WHERE claim_pin = $1 LIMIT 1`,
        [claim_pin],
      );
      if (!existing[0]) return { claim_pin, static_qr_data };
    }
    throw new BadRequestException('Could not generate claim PIN — try again');
  }

  private inferCurrentMealType(): string | null {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 11) return 'BREAKFAST';
    if (hour >= 11 && hour < 16) return 'LUNCH';
    if (hour >= 18 && hour < 23) return 'DINNER';
    return null;
  }

  private parseMenuItems(raw?: string): string[] {
    if (!raw?.trim()) return ['Dal', 'Rice', 'Roti', 'Salad'];
    return raw
      .split(/[,;&+]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private assertAdvanceWindow(orderDate: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(`${orderDate}T12:00:00`);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round(
      (target.getTime() - today.getTime()) / 86_400_000,
    );
    if (diffDays < 0)
      throw new BadRequestException('Cannot order for past dates');
    if (diffDays >= MAX_ADVANCE_DAYS) {
      throw new BadRequestException(
        `Pre-orders are limited to ${MAX_ADVANCE_DAYS} days in advance`,
      );
    }
  }

  private assertNotPastCutoff(orderDate: string, mealType: string) {
    if (this.isCutoffPassed(orderDate, mealType)) {
      const cfg = MEAL_CUTOFFS[mealType.toUpperCase()];
      throw new BadRequestException(
        `${mealType} add-on orders closed at ${cfg?.label ?? 'cut-off time'} for today`,
      );
    }
  }

  isCutoffPassed(orderDate: string, mealType: string): boolean {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (orderDate !== todayStr) return false;

    const cfg = MEAL_CUTOFFS[mealType.toUpperCase()];
    if (!cfg) return false;

    const now = new Date();
    const cutoff = new Date();
    cutoff.setHours(cfg.hour, cfg.minute, 0, 0);
    return now >= cutoff;
  }

  private generateTotp(studentUserId: string, windowOffset = 0): string {
    const period = Math.floor(Date.now() / 30_000) + windowOffset;
    return createHash('sha256')
      .update(`${studentUserId}:meal-pass:${period}`)
      .digest('hex')
      .slice(0, 6)
      .toUpperCase();
  }

  private validateTotp(studentUserId: string, totp: string): boolean {
    return (
      totp === this.generateTotp(studentUserId, 0) ||
      totp === this.generateTotp(studentUserId, -1)
    );
  }
}
