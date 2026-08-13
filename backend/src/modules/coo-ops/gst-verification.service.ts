import { Injectable, Logger } from '@nestjs/common';
import { isValidGstinFormat, normalizeGstin, panFromGstin } from './gstin.util';

export type GstVerifyResult = {
  gstin: string;
  status:
    | 'ACTIVE'
    | 'INACTIVE'
    | 'INVALID_FORMAT'
    | 'PENDING_CREDENTIALS'
    | 'API_ERROR';
  active: boolean;
  legalName: string | null;
  pan: string | null;
  raw?: Record<string, unknown>;
};

@Injectable()
export class GstVerificationService {
  private readonly logger = new Logger(GstVerificationService.name);

  private credentialsConfigured(): boolean {
    return Boolean(
      process.env.GST_API_BASE_URL?.trim() && process.env.GST_API_KEY?.trim(),
    );
  }

  async verifyGstin(gstinInput: string): Promise<GstVerifyResult> {
    const gstin = normalizeGstin(gstinInput);
    if (!isValidGstinFormat(gstin)) {
      return {
        gstin,
        status: 'INVALID_FORMAT',
        active: false,
        legalName: null,
        pan: null,
      };
    }

    const pan = panFromGstin(gstin);

    if (!this.credentialsConfigured()) {
      return {
        gstin,
        status: 'PENDING_CREDENTIALS',
        active: true,
        legalName: null,
        pan,
        raw: { reason: 'GST_API_BASE_URL / GST_API_KEY not configured' },
      };
    }

    const base = process.env.GST_API_BASE_URL!.replace(/\/$/, '');
    const key = process.env.GST_API_KEY!;
    const path =
      process.env.GST_API_VERIFY_PATH?.trim() ||
      `/gstin/${encodeURIComponent(gstin)}`;

    try {
      const res = await fetch(
        `${base}${path.startsWith('/') ? path : `/${path}`}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${key}`,
            'x-api-key': key,
            Accept: 'application/json',
          },
        },
      );

      if (!res.ok) {
        this.logger.warn(`GST API HTTP ${res.status} for ${gstin}`);
        return {
          gstin,
          status: 'API_ERROR',
          active: false,
          legalName: null,
          pan,
          raw: { http_status: res.status },
        };
      }

      const body = (await res.json()) as Record<string, unknown>;
      const active =
        body.active === true ||
        String(body.status ?? body.sts ?? '').toUpperCase() === 'ACTIVE';
      const legalName =
        String(
          body.legalName ?? body.lgnm ?? body.tradeNam ?? body.legal_name ?? '',
        ).trim() || null;

      return {
        gstin,
        status: active ? 'ACTIVE' : 'INACTIVE',
        active,
        legalName,
        pan: String(body.pan ?? pan ?? '').trim() || pan,
        raw: body,
      };
    } catch (err) {
      this.logger.error(`GST API error for ${gstin}: ${String(err)}`);
      return {
        gstin,
        status: 'API_ERROR',
        active: false,
        legalName: null,
        pan,
        raw: { error: String(err) },
      };
    }
  }
}
