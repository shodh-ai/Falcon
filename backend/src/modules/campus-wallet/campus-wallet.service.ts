import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource } from 'typeorm';

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

  async topUp(tenantId: string, studentUserId: string, amount: number, referenceId: string) {
    if (amount <= 0) throw new BadRequestException('Invalid amount');
    const wallet = await this.getOrCreateWallet(tenantId, studentUserId);
    const newBalance = Number(wallet.current_balance) + amount;
    await this.dataSource.query(
      `UPDATE campus_wallets SET current_balance = $2, last_updated = NOW() WHERE wallet_id = $1`,
      [wallet.wallet_id, newBalance],
    );
    await this.dataSource.query(
      `INSERT INTO campus_wallet_ledger (wallet_id, entry_type, amount, balance_after, reference_id, note)
       VALUES ($1, 'TOP_UP', $2, $3, $4, 'Wallet top-up')`,
      [wallet.wallet_id, amount, newBalance, referenceId],
    );
    return { wallet_id: wallet.wallet_id, current_balance: newBalance };
  }

  listCatalog(tenantId: string) {
    return this.dataSource.query(
      `SELECT * FROM mess_addon_catalog WHERE tenant_id = $1 AND is_active = true ORDER BY item_name`,
      [tenantId],
    );
  }

  async preOrderAddon(
    tenantId: string,
    studentUserId: string,
    dto: { item_id: string; order_date: string; meal_type: string },
  ) {
    const itemRows = await this.dataSource.query(
      `SELECT * FROM mess_addon_catalog WHERE item_id = $1 AND tenant_id = $2`,
      [dto.item_id, tenantId],
    );
    const item = itemRows[0];
    if (!item) throw new BadRequestException('Item not found');

    const wallet = await this.getOrCreateWallet(tenantId, studentUserId);
    const price = Number(item.price);
    if (Number(wallet.current_balance) < price) {
      throw new BadRequestException('Insufficient wallet balance');
    }
    const newBalance = Number(wallet.current_balance) - price;
    await this.dataSource.query(
      `UPDATE campus_wallets SET current_balance = $2, last_updated = NOW() WHERE wallet_id = $1`,
      [wallet.wallet_id, newBalance],
    );
    const orderRows = await this.dataSource.query(
      `INSERT INTO mess_addon_orders (tenant_id, student_user_id, item_id, item_name, amount_deducted, order_date, meal_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [tenantId, studentUserId, item.item_id, item.item_name, price, dto.order_date, dto.meal_type],
    );
    await this.dataSource.query(
      `INSERT INTO campus_wallet_ledger (wallet_id, entry_type, amount, balance_after, reference_id, note)
       VALUES ($1, 'MESS_DEBIT', $2, $3, $4, $5)`,
      [wallet.wallet_id, -price, newBalance, orderRows[0].order_id, `Pre-order: ${item.item_name}`],
    );
    return orderRows[0];
  }

  async generateMealToken(tenantId: string, studentUserId: string) {
    const nonce = randomBytes(16).toString('hex');
    const tokenHash = createHash('sha256').update(`${studentUserId}:${nonce}:${Date.now()}`).digest('hex');
    const expiresAt = new Date(Date.now() + 30_000);
    await this.dataSource.query(
      `INSERT INTO mess_meal_tokens (tenant_id, student_user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [tenantId, studentUserId, tokenHash, expiresAt.toISOString()],
    );
    return { qr_payload: `${studentUserId}:${tokenHash}`, expires_at: expiresAt, refresh_in_seconds: 30 };
  }

  async scanMealToken(tenantId: string, qrPayload: string) {
    const [studentUserId, tokenHash] = qrPayload.split(':');
    if (!studentUserId || !tokenHash) throw new BadRequestException('Invalid QR');

    const tokenRows = await this.dataSource.query(
      `SELECT * FROM mess_meal_tokens
       WHERE tenant_id = $1 AND student_user_id = $2 AND token_hash = $3 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, studentUserId, tokenHash],
    );
    if (!tokenRows[0]) throw new BadRequestException('QR expired or invalid');

    const orders = await this.dataSource.query(
      `SELECT item_name, meal_type, amount_deducted FROM mess_addon_orders
       WHERE tenant_id = $1 AND student_user_id = $2 AND order_date = CURRENT_DATE AND is_redeemed = false
       ORDER BY created_at ASC`,
      [tenantId, studentUserId],
    );

    const studentRows = await this.dataSource.query(`SELECT name FROM users WHERE user_id = $1`, [studentUserId]);

    if (orders[0]) {
      await this.dataSource.query(
        `UPDATE mess_addon_orders SET is_redeemed = true WHERE student_user_id = $1 AND order_date = CURRENT_DATE AND is_redeemed = false`,
        [studentUserId],
      );
    }

    return {
      valid: true,
      student_name: studentRows[0]?.name ?? 'Student',
      base_meal: 'Standard hostel meal included',
      addons: orders.map((o: { item_name: string; meal_type: string }) => `${o.item_name} (${o.meal_type})`),
      status: 'GREEN',
    };
  }
}
