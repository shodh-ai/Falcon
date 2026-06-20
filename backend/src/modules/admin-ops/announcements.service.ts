import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly dataSource: DataSource) {}

  async listForAdmin(tenantId: string) {
    return this.dataSource.query(
      `SELECT a.*, u.name AS created_by_name
       FROM campus_announcements a
       LEFT JOIN users u ON u.user_id = a.created_by_user_id
       WHERE a.tenant_id = $1
       ORDER BY a.published_at DESC`,
      [tenantId],
    );
  }

  async create(
    tenantId: string,
    userId: string,
    dto: { title: string; body_html: string },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO campus_announcements (
         tenant_id, title, body_html, target_all_students, target_all_faculty,
         target_dept_ids, created_by_user_id
       ) VALUES ($1,$2,$3,true,true,'{}',$4)
       RETURNING *`,
      [tenantId, dto.title.trim(), dto.body_html, userId],
    );
    return rows[0];
  }

  /** Global notice board — same items for every authenticated user on the tenant. */
  async listForUser(tenantId: string) {
    return this.dataSource.query(
      `SELECT announcement_id, title, body_html, published_at
       FROM campus_announcements
       WHERE tenant_id = $1 AND is_published = true
       ORDER BY published_at DESC
       LIMIT 20`,
      [tenantId],
    );
  }
}
