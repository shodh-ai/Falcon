const STAFF_PORTAL_PREFIXES = ['faculty', 'hod', 'hr', 'dean'] as const;

export type HelpdeskPortalPrefix = (typeof STAFF_PORTAL_PREFIXES)[number];

/** Base list URL for "my tickets" from the current pathname. */
export function myHelpdeskTicketsBasePath(pathname: string): string {
  for (const prefix of STAFF_PORTAL_PREFIXES) {
    if (pathname.startsWith(`/${prefix}/me/tickets`)) {
      return `/${prefix}/me/tickets`;
    }
  }
  if (pathname.startsWith('/student/helpdesk')) {
    return '/student/helpdesk';
  }
  return '/faculty/me/tickets';
}

export function myHelpdeskTicketDetailPath(pathname: string, ticketId: string): string {
  return `${myHelpdeskTicketsBasePath(pathname)}/${encodeURIComponent(ticketId)}`;
}

export function isValidHelpdeskTicketId(id: string): boolean {
  const trimmed = id.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return false;
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed) ||
    /^TKT-/i.test(trimmed)
  );
}

export function campusAdminHelpdeskBasePath(): string {
  return '/campus-admin/operations/requests';
}

export function campusAdminHelpdeskTicketDetailPath(ticketId: string): string {
  return `${campusAdminHelpdeskBasePath()}/${encodeURIComponent(ticketId)}`;
}
