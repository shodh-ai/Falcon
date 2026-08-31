/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument -- TypeORM query() rows are untyped */
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AcquisitionService } from './acquisition.service';
import type { CreateAcquisitionInput } from './acquisition.types';
import type { IrmsIdentity } from './irms-service-auth.guard';
import { sha256 } from './acquisition.util';

@Injectable()
export class AcquisitionIntegrationService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly acquisitions: AcquisitionService,
  ) {}

  async create(
    identity: IrmsIdentity,
    idempotencyKey: string,
    requestId: string,
    body: {
      requester_user_id: string;
      external_reference: string;
      acquisition: Omit<
        CreateAcquisitionInput,
        'source' | 'external_reference'
      >;
    },
  ) {
    if (!idempotencyKey?.trim() || !requestId?.trim()) {
      throw new ConflictException(
        'Idempotency-Key and X-Request-ID are required',
      );
    }
    const requestHash = sha256(body);
    const existing = await this.db.query(
      `SELECT * FROM acq_integration_idempotency
       WHERE tenant_id=$1 AND client_id=$2 AND idempotency_key=$3`,
      [identity.tenant_id, identity.client_id, idempotencyKey],
    );
    let claimedRetry = false;
    if (existing[0]) {
      if (existing[0].request_hash !== requestHash) {
        throw new ConflictException({
          message: 'Idempotency key was reused with a different payload',
          code: 'IDEMPOTENCY_CONFLICT',
        });
      }
      if (existing[0].response_payload) return existing[0].response_payload;
      if (Number(existing[0].response_status) >= 500) {
        const claimed = await this.db.query(
          `UPDATE acq_integration_idempotency SET response_status=NULL
           WHERE idempotency_id=$1 AND response_status>=500
           RETURNING idempotency_id`,
          [existing[0].idempotency_id],
        );
        claimedRetry = Boolean(claimed[0]);
      }
      if (!claimedRetry) {
        throw new ConflictException(
          'An identical request is already processing',
        );
      }
    }
    const inserted = claimedRetry
      ? [{ idempotency_id: existing[0].idempotency_id }]
      : await this.db.query(
          `INSERT INTO acq_integration_idempotency (
         tenant_id,client_id,idempotency_key,request_hash,expires_at
       ) VALUES ($1,$2,$3,$4,NOW()+INTERVAL '24 hours')
       ON CONFLICT (tenant_id,client_id,idempotency_key) DO NOTHING
       RETURNING idempotency_id`,
          [identity.tenant_id, identity.client_id, idempotencyKey, requestHash],
        );
    if (!inserted[0]) {
      const raced = await this.db.query(
        `SELECT request_hash,response_payload FROM acq_integration_idempotency
         WHERE tenant_id=$1 AND client_id=$2 AND idempotency_key=$3`,
        [identity.tenant_id, identity.client_id, idempotencyKey],
      );
      if (raced[0]?.request_hash !== requestHash) {
        throw new ConflictException({
          message: 'Idempotency key was reused with a different payload',
          code: 'IDEMPOTENCY_CONFLICT',
        });
      }
      if (raced[0]?.response_payload) return raced[0].response_payload;
      throw new ConflictException('An identical request is already processing');
    }
    try {
      const actor = {
        user_id: body.requester_user_id,
        tenant_id: identity.tenant_id,
      };
      const recoverable = await this.db.query(
        `SELECT r.acquisition_id,r.acquisition_number,v.acquisition_version_id,
                v.version_number,v.status
         FROM acq_requests r
         JOIN acq_request_versions v ON v.acquisition_version_id=r.current_version_id
         WHERE r.tenant_id=$1 AND r.integration_client_id=$2
           AND r.source='IRMS' AND r.external_reference=$3`,
        [
          identity.tenant_id,
          identity.integration_client_id,
          body.external_reference,
        ],
      );
      const created =
        recoverable[0] ??
        (await this.acquisitions.createDraft(
          actor,
          {
            ...body.acquisition,
            source: 'IRMS',
            external_reference: body.external_reference,
            integration_client_id: identity.integration_client_id,
          },
          requestId,
        ));
      let response: unknown;
      if (created.status === 'DRAFT') {
        const validation = await this.acquisitions.validate(
          actor,
          created.acquisition_version_id,
        );
        response = validation.valid
          ? await this.acquisitions.submit(
              actor,
              created.acquisition_version_id,
            )
          : { ...created, validation };
      } else if (created.status === 'VALIDATED') {
        response = await this.acquisitions.submit(
          actor,
          created.acquisition_version_id,
        );
      } else {
        response = await this.acquisitions.getVersion(
          actor,
          created.acquisition_version_id,
        );
      }
      await this.db.query(
        `UPDATE acq_integration_idempotency
         SET response_status=201,response_payload=$4::jsonb
         WHERE tenant_id=$1 AND client_id=$2 AND idempotency_key=$3`,
        [
          identity.tenant_id,
          identity.client_id,
          idempotencyKey,
          JSON.stringify(response),
        ],
      );
      return response;
    } catch (error) {
      await this.db.query(
        `UPDATE acq_integration_idempotency SET response_status=500
         WHERE tenant_id=$1 AND client_id=$2 AND idempotency_key=$3
           AND response_payload IS NULL`,
        [identity.tenant_id, identity.client_id, idempotencyKey],
      );
      throw error;
    }
  }

  async status(identity: IrmsIdentity, versionId: string) {
    const rows = await this.db.query(
      `SELECT r.acquisition_id,r.acquisition_number,r.external_reference,
              v.acquisition_version_id,v.version_number,v.status,v.snapshot_hash,
              v.estimated_total,v.currency,v.updated_at
       FROM acq_requests r
       JOIN acq_request_versions v ON v.acquisition_id=r.acquisition_id
       WHERE r.tenant_id=$1 AND r.integration_client_id=$2
         AND v.acquisition_version_id=$3`,
      [identity.tenant_id, identity.integration_client_id, versionId],
    );
    if (!rows[0]) return null;
    return rows[0];
  }
}
