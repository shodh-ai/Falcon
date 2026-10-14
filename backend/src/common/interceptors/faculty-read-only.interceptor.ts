import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

/** This is an observer, not an extra teaching allocation. Deny by default. */
@Injectable()
export class FacultyReadOnlyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.read_only_faculty_source_id) return next.handle();
    const path = String(req.originalUrl ?? req.url).split('?')[0].replace(/\/$/, '');
    const method = String(req.method).toUpperCase();
    const read = method === 'GET' || method === 'HEAD';
    // Authentication operations always use Sachin's identity, never the source.
    if (read && /^(?:\/api)?\/auth\/(?:me|me\/permissions|profile)$/.test(path)) return next.handle();
    if (method === 'POST' && /^(?:\/api)?\/auth\/change-password$/.test(path)) return next.handle();
    if (method === 'POST' && path === '/api/staff/onboarding/reset-password') return next.handle();
    if (read && path === '/api/staff/onboarding/status') return next.handle();
    if (read && /^\/api\/platform\/modules\/runtime$/.test(path)) return next.handle();
    if (!read) throw new ForbiddenException('This faculty observer account is read-only.');
    const academic = /^\/api\/academics\/faculty\/(?:dashboard|teaching-departments|today-classes|timetable\/today|practical-batches|attendance\/missing|profile|profile\/compliance|workspaces\/(?:courses|timetable|timetable\/schedule-data|timetable\/stats))$/.test(path)
      || /^\/api\/academics\/faculty\/course\/[^/]+\/(?:students|attendance|attendance\/analytics|attendance\/previous-session|practical-batch)$/.test(path)
      || /^\/api\/academics\/faculty\/courses\/[^/]+\/workspace$/.test(path);
    if (!academic) throw new ForbiddenException('This observer account can only view assigned academic data.');
    const viewer = { ...user };
    req.user = { ...user, observer_actor_user_id: user.user_id, user_id: user.read_only_faculty_source_id };
    return next.handle().pipe(map((value: any) => {
      if (path !== '/api/academics/faculty/profile') return value;
      // The profile page is also the workload consumer. Return workload, not
      // the source's KYC, bank, contact details, documents or research identity.
      return {
        user_id: viewer.user_id, name: viewer.name, display_name: viewer.name,
        email: viewer.email, role: 'Faculty', department: viewer.department,
        designation: 'Read-only academic observer', workload: value?.workload,
        responsibilities: [], qualifications: [], research_summary: {},
        personal: {}, kyc: {}, research_identifiers: {},
        active_mentees: 0, api_score: 0,
        compliance: { needs_academic_profile: false },
        read_only_academic_view: true,
      };
    }));
  }
}
