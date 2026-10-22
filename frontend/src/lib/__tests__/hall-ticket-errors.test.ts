import { describe, expect, it } from 'vitest';
import { parseApiError } from '@/lib/notifications/parse-api-error';

describe('Hall-ticket error messages', () => {
  it.each(['Hall ticket is invalid or no longer current', 'Could not revoke this hall ticket', 'The server did not confirm hall-ticket revocation'])('preserves examination errors: %s', (message) => {
    expect(parseApiError(message)).toMatchObject({ category: 'EXAMS', message });
    expect(parseApiError(message).title).not.toContain('Helpdesk');
  });
  it('keeps helpdesk ticket errors in their existing category', () => {
    expect(parseApiError('Cannot POST /api/helpdesk/tickets')).toMatchObject({ category: 'HELPDESK' });
  });
  it('preserves authentication and network failure handling', () => {
    expect(parseApiError('API 401 /api/exam-cell/hall-ticket-issues')).toMatchObject({ title: 'Sign in required' });
    expect(parseApiError('Failed to fetch hall ticket')).toMatchObject({ title: 'Cannot reach server' });
  });
});
