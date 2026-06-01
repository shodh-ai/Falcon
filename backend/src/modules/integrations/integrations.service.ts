import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class IntegrationsService {
  constructor(private readonly dataSource: DataSource) {}

  jobs() {
    return this.dataSource.query('SELECT * FROM integration_jobs ORDER BY created_at DESC');
  }

  queueGovernmentPush(type: 'DIGILOCKER' | 'NAD' | 'ABC', entityType: string, entityId?: string) {
    return this.dataSource.query(
      `INSERT INTO integration_jobs (tenant_id, integration_type, entity_type, entity_id, payload)
       VALUES ('a0000000-0000-4000-8000-000000000001', $1, $2, $3, '{}'::jsonb)
       RETURNING *`,
      [type, entityType, entityId ?? null],
    );
  }

  sendWhatsApp(to: string, message: string) {
    return this.dataSource.query(
      `INSERT INTO integration_jobs (tenant_id, integration_type, entity_type, payload)
       VALUES ('a0000000-0000-4000-8000-000000000001', 'WHATSAPP', 'parent_alert', $1::jsonb)
       RETURNING *`,
      [JSON.stringify({ to, message, provider: 'META_OR_TWILIO' })],
    );
  }
}
