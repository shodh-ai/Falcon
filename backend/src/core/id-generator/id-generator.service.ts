import { Injectable } from '@nestjs/common';

export interface IdTemplateContext {
  PROG?: string;
  CAMPUS?: string;
  DEPT?: string;
  YEAR?: string | number;
  SEQ?: string | number;
  [key: string]: string | number | undefined;
}

/**
 * Builds enrolment / employee / receipt IDs from configurable templates so
 * we never hard-code the university's numbering scheme. The format string
 * (e.g. "[PROG]-[YEAR]-[SEQ]") is stored in the `settings` table and
 * resolved at runtime against the supplied context.
 *
 * SEQ is left-padded to `seqPadding` (default 5) so 1 -> "00001". The
 * sequence number itself MUST come from a transactional counter table; this
 * service is concerned only with formatting.
 */
@Injectable()
export class IdGeneratorService {
  format(template: string, ctx: IdTemplateContext, seqPadding = 5): string {
    return template.replace(/\[([A-Z_]+)\]/g, (match, key: string) => {
      const value = ctx[key];
      if (value === undefined || value === null) {
        return match;
      }
      if (key === 'SEQ') {
        return String(value).padStart(seqPadding, '0');
      }
      if (key === 'YEAR') {
        return String(value).slice(-4);
      }
      return String(value);
    });
  }
}
