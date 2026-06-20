import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFile } from 'fs/promises';
import { pickExtractionRule } from './extraction-rules';
import { AiSubmissionStatus } from '../common/enums/ai-submission-status.enum';

export interface AiAuditResult {
  status: AiSubmissionStatus;
  extracted_data: Record<string, unknown>;
  remarks: string | null;
}

function parseJsonResponse(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(cleaned) as Record<string, unknown>;
  }
}

function normalizeExtracted(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function normalizeModelName(modelName: string): string {
  return modelName.replace(/^models\//, '').trim();
}

function buildModelCandidates(configuredModel: string): string[] {
  const first = normalizeModelName(configuredModel || 'gemini-2.0-flash');
  const fallbacks = ['gemini-2.0-flash', 'gemini-flash-latest'];
  return [first, ...fallbacks].filter(
    (m, idx, arr) => m && arr.indexOf(m) === idx,
  );
}

/** Maps Gemini payload → DB (supports CSV schema + existing status/remarks). */
function toAuditResult(obj: Record<string, unknown>): AiAuditResult {
  if (typeof obj.is_valid === 'boolean') {
    const valid = obj.is_valid;
    const rejection =
      obj.rejection_reason == null || obj.rejection_reason === ''
        ? null
        : String(obj.rejection_reason);
    const extracted = normalizeExtracted(obj.extracted_data);
    return {
      status: valid
        ? AiSubmissionStatus.VALIDATED
        : AiSubmissionStatus.REJECTED_MISMATCH,
      extracted_data: valid ? extracted : {},
      remarks: valid
        ? null
        : rejection ||
          'Document rejected as invalid or not matching this task.',
    };
  }

  const statusRaw = String(obj.status || '').toUpperCase();
  const status =
    statusRaw === AiSubmissionStatus.REJECTED_MISMATCH
      ? AiSubmissionStatus.REJECTED_MISMATCH
      : AiSubmissionStatus.VALIDATED;
  const extracted = normalizeExtracted(obj.extracted_data);
  const remarks = obj.remarks == null ? null : String(obj.remarks);
  return {
    status,
    extracted_data: extracted,
    remarks:
      status === AiSubmissionStatus.REJECTED_MISMATCH
        ? remarks || 'Rejected by model.'
        : remarks,
  };
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);

  constructor(private readonly config: ConfigService) {}

  async analyzePdfForTask(params: {
    absolutePdfPath: string;
    taskName: string;
  }): Promise<AiAuditResult> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const configuredModel =
      this.config.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash';
    const { taskLabel, extractionFields, validationNotes } = pickExtractionRule(
      params.taskName,
    );

    const fieldLines = Object.entries(extractionFields)
      .map(([k, desc]) => `      "${k}": <value per description: ${desc}>`)
      .join(',\n');

    const validationNotesBlock = validationNotes
      ? `\n## Task-specific validation rules\n${validationNotes}\n`
      : '';

    const prompt = `You are an IQAC document auditor for a university governance system.

## Assigned governance task (category)
Official label: "${taskLabel}"
Database task name: "${params.taskName}"
${validationNotesBlock}
## Your job
1. Read the attached PDF.
2. Decide whether it genuinely belongs to this task category (correct subject matter and intent). Minor layout or wording differences are OK.
3. If the PDF is blank, unrelated (e.g. a grocery list), or clearly the wrong document type for this task, set "is_valid" to false and explain in "rejection_reason" (be concise).
4. If it matches this task category, set "is_valid" to true and fill "extracted_data" using ONLY these keys (use null for unknown values; use correct JSON types: strings, numbers, arrays as specified):
{
${fieldLines}
}

## Required response format (ONLY this JSON shape — no markdown, no extra keys at top level)
{
  "is_valid": true,
  "rejection_reason": null,
  "extracted_data": { }
}

When invalid:
{
  "is_valid": false,
  "rejection_reason": "<short explanation>",
  "extracted_data": {}
}

Rules:
- Top-level keys must be exactly: is_valid (boolean), rejection_reason (string or null), extracted_data (object).
- When is_valid is true, rejection_reason must be null.
- When is_valid is false, extracted_data should be {} and rejection_reason must be a non-empty string.`;

    const buffer = await readFile(params.absolutePdfPath);
    const maxBytes = 18 * 1024 * 1024;
    if (buffer.length > maxBytes) {
      return {
        status: AiSubmissionStatus.REJECTED_MISMATCH,
        extracted_data: {},
        remarks: `PDF exceeds ${maxBytes} bytes; not sent to AI. Split or compress the file.`,
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const candidates = buildModelCandidates(configuredModel);
    let result: Awaited<
      ReturnType<
        ReturnType<GoogleGenerativeAI['getGenerativeModel']>['generateContent']
      >
    > | null = null;
    let lastErr: unknown = null;

    for (const modelName of candidates) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
          },
        });
        result = await model.generateContent([
          { text: prompt },
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: buffer.toString('base64'),
            },
          },
        ]);
        break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const notFound =
          msg.includes('404') || msg.toLowerCase().includes('not found');
        if (notFound) {
          this.logger.warn(
            `Gemini model unavailable: ${modelName}. Trying next fallback...`,
          );
          continue;
        }
        throw err;
      }
    }

    if (!result) {
      throw lastErr instanceof Error
        ? lastErr
        : new Error('No usable Gemini model found for generateContent.');
    }

    const text = result.response.text();
    let obj: Record<string, unknown>;
    try {
      obj = parseJsonResponse(text);
    } catch (e) {
      this.logger.warn(`Gemini JSON parse failed: ${text.slice(0, 240)}`);
      throw e;
    }

    return toAuditResult(obj);
  }
}
