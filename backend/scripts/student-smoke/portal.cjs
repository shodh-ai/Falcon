'use strict';

// This module is called only by the environment-guarded Student smoke runner.
// Business transitions go through authenticated APIs. It never runs on import.
const { createHash } = require('node:crypto');

const PREFIX = '[SMOKE v1]';
const CREATED_API_ROWS = new WeakMap();
const TABLES = new Set([
  'users',
  'academic_courses',
  'academic_mentorships',
  'mentorship_meetings',
  'academic_proctor_interactions',
  'student_certificates',
  'helpdesk_tickets',
  'admin_academic_calendar_events',
  'university_policies',
  'student_policy_acknowledgements',
  'falcon_notifications',
  'course_modules',
  'course_materials',
  'course_material_visibility',
  'course_announcements',
]);

function dateOffset(seedDate, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(seedDate ?? ''))
    throw new Error('A stable seedDate is required');
  const date = new Date(`${seedDate}T12:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== seedDate
  ) {
    throw new Error('Invalid seedDate');
  }
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function requireCheck(ctx, name, condition, detail) {
  ctx.check(name, Boolean(condition), detail);
  if (!condition) throw new Error(`${name}: ${detail}`);
}

async function findRows(ctx, table, match) {
  if (!TABLES.has(table))
    throw new Error(`Unsupported portal fixture table: ${table}`);
  const entries = Object.entries(match);
  if (!entries.length || entries.some(([key]) => !/^[a-z_]+$/.test(key))) {
    throw new Error('A valid ownership-scoped lookup is required');
  }
  const sql = `SELECT * FROM "${table}" WHERE ${entries.map(([key], index) => `"${key}" = $${index + 1}`).join(' AND ')}`;
  const result = await ctx.db.query(
    sql,
    entries.map(([, value]) => value),
  );
  return result.rows;
}

async function existing(ctx, table, match) {
  const rows = await findRows(ctx, table, match);
  requireCheck(
    ctx,
    `${table}: unique smoke natural key`,
    rows.length <= 1,
    'Duplicate fixture keys must be investigated, never overwritten',
  );
  if (rows[0])
    requireCheck(
      ctx,
      `${table}: not archived`,
      !rows[0].deleted_at,
      'Archived smoke records are not silently recreated',
    );
  return rows[0];
}

async function apiFixture(ctx, table, match, feature, create) {
  let row = await existing(ctx, table, match);
  const created = !row;
  if (!row) {
    await create();
    row = await existing(ctx, table, match);
    requireCheck(
      ctx,
      `${feature}: persisted`,
      Boolean(row),
      `${table} API did not persist the expected fixture`,
    );
  }
  if (created)
    CREATED_API_ROWS.get(ctx)?.add(`${table}:${JSON.stringify(match)}`);
  await ctx.track(table, row, feature, created);
  return row;
}

function apiCreated(ctx, table, match) {
  return (
    CREATED_API_ROWS.get(ctx)?.has(`${table}:${JSON.stringify(match)}`) ?? false
  );
}

async function pdfFixture(ctx, kind) {
  const file = await ctx.fixture(kind);
  requireCheck(
    ctx,
    `${kind}: actual PDF fixture`,
    file?.type === 'application/pdf' &&
      Buffer.isBuffer(file.buffer) &&
      file.buffer.subarray(0, 4).toString() === '%PDF',
    'Expected a real synthetic PDF, never a broken path or remote document',
  );
  return file;
}

async function assertOwnership(ctx) {
  const { ids } = ctx;
  dateOffset(ctx.seedDate, 0);
  requireCheck(
    ctx,
    'portal fixture prerequisites',
    Boolean(
      ids.tenantId &&
      ids.studentId &&
      ids.facultyId &&
      ids.adminId &&
      ids.courses?.length,
    ),
    'Dedicated tenant, synthetic actors and allocated courses must exist first',
  );
  for (const id of [ids.studentId, ids.facultyId, ids.adminId]) {
    const user = await existing(ctx, 'users', {
      user_id: id,
      tenant_id: ids.tenantId,
    });
    requireCheck(
      ctx,
      'portal actor tenant ownership',
      Boolean(user && user.is_active),
      'Actor must be active in the dedicated smoke tenant',
    );
  }
  for (const course of ids.courses) {
    const interrupted = await existing(ctx, 'course_materials', { tenant_id: ids.tenantId, course_id: course.course_id, title: `${PREFIX} ${course.course_code ?? 'Course'} worked examples` });
    if (interrupted) {
      await ctx.track('course_materials', interrupted, 'Retained unpublished interrupted upload');
      (ctx.report.retainedInterruptedMaterials ||= []).push(interrupted.material_id);
    }
    const owned = await existing(ctx, 'academic_courses', {
      course_id: course.course_id,
      tenant_id: ids.tenantId,
    });
    requireCheck(
      ctx,
      'portal course tenant ownership',
      Boolean(owned && course.allocation_id),
      'Course and faculty allocation must belong to the smoke tenant',
    );
  }
}

async function seedMentorship(ctx, refs) {
  const { ids, actors } = ctx;
  const match = { student_user_id: ids.studentId };
  const mentor = await apiFixture(
    ctx,
    'academic_mentorships',
    match,
    'mentorship',
    () =>
      ctx.request(actors.admin, 'POST', '/api/academics/proctor/mentorships', {
        student_user_id: ids.studentId,
        proctor_user_id: ids.facultyId,
        active_from: dateOffset(ctx.seedDate, -30),
      }),
  );
  requireCheck(
    ctx,
    'mentor assignment retained',
    mentor.proctor_user_id === ids.facultyId && mentor.is_active,
    'Do not replace a different existing mentor',
  );

  for (const target of ['APPROVED', 'PENDING']) {
    const topic = `${PREFIX} ${target === 'APPROVED' ? 'Academic planning' : 'Project advice'} meeting`;
    const meetingMatch = { student_user_id: ids.studentId, topic };
    let row = await apiFixture(
      ctx,
      'mentorship_meetings',
      meetingMatch,
      'mentor meetings',
      () =>
        ctx.request(actors.student, 'POST', '/api/academics/proctor/meetings', {
          meeting_at: `${dateOffset(ctx.seedDate, target === 'APPROVED' ? 2 : 4)}T09:00:00+05:30`,
          note: topic,
        }),
    );
    if (target === 'APPROVED' && row.status === 'PENDING') {
      await ctx.request(
        actors.faculty,
        'POST',
        `/api/academics/proctor/meetings/${row.meeting_id}/respond`,
        {
          status: 'APPROVED',
          remarks: `${PREFIX} Meet in the synthetic campus mentoring room at the scheduled time.`,
        },
      );
      row = await existing(ctx, 'mentorship_meetings', {
        meeting_id: row.meeting_id,
        student_user_id: ids.studentId,
      });
    }
    requireCheck(
      ctx,
      'mentor meeting workflow status',
      row.status === target && row.proctor_user_id === ids.facultyId,
      'Existing records are not reset to force the requested state',
    );
    await ctx.track('mentorship_meetings', row, 'mentor meetings');
    refs.meetings.push(row.meeting_id);
    const interactions = await findRows(ctx, 'academic_proctor_interactions', {
      student_user_id: ids.studentId,
      proctor_user_id: ids.facultyId,
      interaction_type: 'MEETING',
    });
    const related = interactions.filter(
      (item) => item.payload?.meeting_id === row.meeting_id,
    );
    requireCheck(
      ctx,
      'mentor meeting interaction linkage',
      related.length === 1 && !related[0].deleted_at,
      'Each actual meeting must have one own service-created interaction',
    );
    await ctx.track(
      'academic_proctor_interactions',
      related[0],
      'mentor meeting history',
      apiCreated(ctx, 'mentorship_meetings', meetingMatch),
    );
  }

  for (const target of ['APPROVED', 'PENDING']) {
    const reason = `${PREFIX} ${target === 'APPROVED' ? 'Synthetic academic workshop' : 'Fictional family appointment'} leave`;
    const rows = await findRows(ctx, 'academic_proctor_interactions', {
      student_user_id: ids.studentId,
      proctor_user_id: ids.facultyId,
      interaction_type: 'LEAVE_REQUEST',
    });
    const matches = rows.filter((row) => row.payload?.reason === reason);
    requireCheck(
      ctx,
      'leave request unique smoke reason',
      matches.length <= 1,
      'Do not duplicate leave requests',
    );
    let row = matches[0];
    const created = !row;
    if (!row) {
      await ctx.request(
        actors.student,
        'POST',
        '/api/academics/proctor/leave-requests',
        {
          reason,
          start_date: dateOffset(ctx.seedDate, target === 'APPROVED' ? 6 : 10),
          end_date: dateOffset(ctx.seedDate, target === 'APPROVED' ? 6 : 11),
        },
      );
      const created = await findRows(ctx, 'academic_proctor_interactions', {
        student_user_id: ids.studentId,
        proctor_user_id: ids.facultyId,
        interaction_type: 'LEAVE_REQUEST',
      });
      row = created.find((item) => item.payload?.reason === reason);
    }
    requireCheck(
      ctx,
      'leave request persisted',
      Boolean(row && !row.deleted_at),
      'Expected an actual own leave request',
    );
    if (target === 'APPROVED' && row.status === 'PENDING') {
      await ctx.request(
        actors.faculty,
        'POST',
        `/api/academics/proctor/leave-requests/${row.interaction_id}/respond`,
        {
          status: 'APPROVED',
          remarks: `${PREFIX} Academic permission granted for the fictional test activity.`,
        },
      );
      row = await existing(ctx, 'academic_proctor_interactions', {
        interaction_id: row.interaction_id,
        student_user_id: ids.studentId,
      });
    }
    requireCheck(
      ctx,
      'leave request workflow status',
      row.status === target,
      'Leave decisions must be produced by the mentor workflow',
    );
    await ctx.track(
      'academic_proctor_interactions',
      row,
      'mentor leave',
      created,
    );
    refs.leaveRequests.push(row.interaction_id);
  }
}

async function seedCertificates(ctx, refs) {
  const { ids, actors } = ctx;
  for (const target of ['VERIFIED', 'REJECTED', 'PENDING']) {
    const title = `${PREFIX} ${target === 'VERIFIED' ? 'Synthetic Python workshop' : target === 'REJECTED' ? 'Fictional unreadable evidence' : 'Synthetic volunteer activity'} certificate`;
    const match = {
      tenant_id: ids.tenantId,
      student_user_id: ids.studentId,
      title,
    };
    let row = await apiFixture(
      ctx,
      'student_certificates',
      match,
      'certificate portfolio',
      async () =>
        ctx.upload(
          actors.student,
          '/api/academics/certificates/upload',
          {
            title,
            issuer: `${PREFIX} Fictional Learning Centre`,
            issue_date: dateOffset(ctx.seedDate, -14),
          },
          await pdfFixture(ctx, 'certificate'),
        ),
    );
    if (target !== 'PENDING' && row.verification_status === 'PENDING') {
      await ctx.request(
        actors.faculty,
        'PATCH',
        `/api/academics/certificates/${row.certificate_id}/verify`,
        {
          status: target,
          points_awarded: target === 'VERIFIED' ? 10 : 0,
          ...(target === 'REJECTED'
            ? {
                rejection_reason: `${PREFIX} Fictional evidence needs a clearer issue date; resubmit for the test.`,
              }
            : {}),
        },
      );
      row = await existing(ctx, 'student_certificates', match);
    }
    requireCheck(
      ctx,
      'certificate verification workflow',
      row.verification_status === target &&
        (target === 'PENDING' ||
          (row.verified_by_user_id === ids.facultyId &&
            Boolean(row.verified_at))),
      'Verification status and reviewer metadata must match the real service decision',
    );
    requireCheck(
      ctx,
      'certificate file metadata',
      Boolean(
        row.file_path &&
        row.original_filename &&
        row.mime_type === 'application/pdf' &&
        Number(row.file_size) > 0,
      ),
      'Certificate must have an actual uploaded file',
    );
    await ctx.track('student_certificates', row, 'certificate portfolio');
    refs.certificates.push(row.certificate_id);
  }
}

async function seedCourseResources(ctx, refs) {
  const { ids, actors } = ctx;
  for (const course of ids.courses) {
    const title = `${PREFIX} Foundations and worked examples`;
    const module = await apiFixture(
      ctx,
      'course_modules',
      { tenant_id: ids.tenantId, course_id: course.course_id, title },
      'course learning units',
      () =>
        ctx.request(
          actors.faculty,
          'POST',
          `/api/academics/faculty/courses/${course.course_id}/modules`,
          { title },
        ),
    );
    const materialTitle = `${PREFIX} ${course.course_code ?? 'Course'} published notes`;
    const materialMatch = {
      tenant_id: ids.tenantId,
      course_id: course.course_id,
      module_id: module.module_id,
      title: materialTitle,
    };
    const material = await apiFixture(
      ctx,
      'course_materials',
      materialMatch,
      'course materials',
      async () =>
        ctx.upload(
          actors.faculty,
          `/api/academics/faculty/courses/modules/${module.module_id}/materials`,
          {
            title: materialTitle,
            material_type: 'NOTES',
            allocation_ids: JSON.stringify([course.allocation_id]),
          },
          { ...(await pdfFixture(ctx, 'material')), field: 'files' },
        ),
    );
    requireCheck(
      ctx,
      'material actual file',
      Boolean(material.file_path),
      'Materials must be uploaded, not placeholder URLs',
    );
    let visibility = await findRows(ctx, 'course_material_visibility', {
      material_id: material.material_id,
      allocation_id: course.allocation_id,
    });
    if (!visibility.length && !apiCreated(ctx, 'course_materials', materialMatch)) {
      await require('./resume-material.cjs').resumeMaterialPublication(ctx, material, course);
      visibility = await findRows(ctx, 'course_material_visibility', { material_id: material.material_id, allocation_id: course.allocation_id });
    }
    requireCheck(
      ctx,
      'material section publication',
      visibility.length === 1,
      'Expected one authorized course allocation publication',
    );
    await ctx.track(
      'course_material_visibility',
      visibility[0],
      'material publication',
      apiCreated(ctx, 'course_materials', materialMatch),
    );
    refs.materials.push(material.material_id);

    const announcementTitle = `${PREFIX} ${course.course_code ?? 'Course'} preparation announcement`;
    const announcement = await apiFixture(
      ctx,
      'course_announcements',
      {
        tenant_id: ids.tenantId,
        course_id: course.course_id,
        title: announcementTitle,
      },
      'course announcements',
      () =>
        ctx.request(
          actors.faculty,
          'POST',
          `/api/academics/faculty/courses/${course.course_id}/announcements`,
          {
            title: announcementTitle,
            body: `${PREFIX} Review the worked examples before the next class. This announcement and every attachment are synthetic smoke-test data.`,
          },
        ),
    );
    refs.announcements.push(announcement.announcement_id);
  }
}

async function seedHelpdesk(ctx, refs) {
  const { ids, actors } = ctx;
  for (const [category, target, subject] of [
    ['OTHER', 'RESOLVED', `${PREFIX} Synthetic portal orientation request`],
    ['IT', 'PENDING', `${PREFIX} Fictional course download support request`],
    ['ACADEMICS', 'IN_PROGRESS', `${PREFIX} Synthetic timetable clarification`],
  ]) {
    const match = {
      tenant_id: ids.tenantId,
      student_user_id: ids.studentId,
      subject,
    };
    let row = await apiFixture(ctx, 'helpdesk_tickets', match, 'helpdesk', () =>
      ctx.request(actors.student, 'POST', '/api/helpdesk/tickets', {
        category,
        subject,
        description: `${PREFIX} This is a clearly fictional support request for the dedicated Student Portal smoke test.`,
        assigned_to_user_id: ids.adminId,
      }),
    );
    requireCheck(
      ctx,
      'helpdesk own assignment',
      row.assigned_to_user_id === ids.adminId && row.category === category,
      'Do not reroute an existing fixture',
    );
    if (target !== 'PENDING' && row.status === 'PENDING') {
      await ctx.request(
        actors.admin,
        'PATCH',
        `/api/helpdesk/tickets/${row.ticket_id}/status`,
        { status: target },
      );
      row = await existing(ctx, 'helpdesk_tickets', match);
    }
    requireCheck(
      ctx,
      'helpdesk workflow status',
      row.status === target && Boolean(row.ticket_ref && row.sla_deadline),
      'Service should generate ticket reference/SLA and legal status transition',
    );
    if (target === 'RESOLVED')
      requireCheck(
        ctx,
        'helpdesk resolution audit',
        Boolean(row.resolved_at) && row.resolved_by === ids.adminId,
        'A resolved request must retain the real resolving actor and timestamp',
      );
    if (target === 'RESOLVED') {
      const message = `${PREFIX} Fictional orientation instructions supplied. No real account or student is affected.`;
      if (
        !(row.conversation ?? []).some(
          (item) =>
            item.sender_user_id === ids.adminId && item.message === message,
        )
      ) {
        await ctx.request(
          actors.admin,
          'POST',
          `/api/helpdesk/tickets/${row.ticket_id}/messages`,
          { message },
        );
        row = await existing(ctx, 'helpdesk_tickets', match);
      }
    }
    await ctx.track('helpdesk_tickets', row, 'helpdesk');
    refs.tickets.push(row.ticket_id);
  }
}

async function seedCalendarPoliciesNotifications(ctx, refs) {
  const { ids, actors } = ctx;
  for (const [scope, scopeId, offset, label, type] of [
    ['CAMPUS', ids.campusId, 1, 'Campus learning orientation', 'ACADEMIC'],
    [
      'DEPARTMENT',
      String(ids.deptId),
      3,
      'Department project showcase',
      'UNIVERSITY_EVENT',
    ],
    ['PROGRAMME', ids.programId, 7, 'Programme revision workshop', 'ACADEMIC'],
  ]) {
    requireCheck(
      ctx,
      'calendar actual academic scope',
      Boolean(scopeId),
      'Canonical campus/department/program identifiers are required',
    );
    const title = `${PREFIX} ${label}`;
    const row = await apiFixture(
      ctx,
      'admin_academic_calendar_events',
      { tenant_id: ids.tenantId, title },
      'academic calendar',
      () =>
        ctx.request(actors.admin, 'POST', '/api/admin-control/calendar', {
          title,
          event_type: type,
          starts_on: dateOffset(ctx.seedDate, offset),
          ends_on: dateOffset(ctx.seedDate, offset),
          description: `${PREFIX} Fictional academic activity for smoke testing only.`,
          is_all_day: true,
          academic_year: ctx.academicYear,
          event_scope: scope,
          applicable_scope_ids: [String(scopeId)],
          coordinator: `${PREFIX} Synthetic Faculty`,
          activity_category: 'Academic enrichment',
          source_reference: 'student-smoke-v1',
          source_hash: createHash('sha256')
            .update(`${ids.tenantId}:${title}`)
            .digest('hex'),
        }),
    );
    requireCheck(
      ctx,
      'calendar scope consistency',
      row.event_scope === scope &&
        Array.isArray(row.applicable_scope_ids) &&
        row.applicable_scope_ids.includes(String(scopeId)) &&
        row.academic_year === ctx.academicYear,
      'Actual calendar records must retain their dedicated campus/department/program and academic year',
    );
    refs.calendar.push(row.event_id);
  }

  for (const [label, mandatory, voting] of [
    ['Synthetic academic integrity policy', true, false],
    ['Synthetic workshop preference poll', false, true],
  ]) {
    const title = `${PREFIX} ${label}`;
    const match = { tenant_id: ids.tenantId, title };
    let row = await existing(ctx, 'university_policies', match);
    if (!row) {
      const uploaded = await ctx.upload(
        actors.admin,
        '/api/uploads/single',
        {},
        await pdfFixture(ctx, 'policy'),
      );
      const fileUrl = uploaded.path ?? uploaded.key ?? uploaded.url;
      requireCheck(
        ctx,
        'policy actual file upload',
        Boolean(fileUrl),
        'Upload must return a stored file reference',
      );
      row = await ctx.ensureRow(
        'university_policies',
        {
          ...match,
          description: `${PREFIX} Fictional policy/poll document for Student Portal smoke testing; it is not a university regulation.`,
          file_url: fileUrl,
          authority_role: 'Dean',
          is_mandatory: mandatory,
          is_voting_enabled: voting,
          status: 'ACTIVE',
        },
        match,
        'student policies',
      );
    }
    requireCheck(
      ctx,
      'policy intended initial state',
      row.status === 'ACTIVE' &&
        row.is_mandatory === mandatory &&
        row.is_voting_enabled === voting &&
        Boolean(row.file_url),
      'Do not overwrite changed policies',
    );
    await ctx.track('university_policies', row, 'student policies');
    refs.policies.push(row.policy_id);
    if (mandatory) {
      const ackMatch = {
        tenant_id: ids.tenantId,
        student_user_id: ids.studentId,
        policy_id: row.policy_id,
      };
      let ack = await existing(
        ctx,
        'student_policy_acknowledgements',
        ackMatch,
      );
      const created = !ack;
      if (!ack) {
        await ctx.request(
          actors.student,
          'POST',
          `/api/student/policies/${row.policy_id}/acknowledge`,
          {},
        );
        ack = await existing(ctx, 'student_policy_acknowledgements', ackMatch);
      }
      requireCheck(
        ctx,
        'policy acknowledgment persisted',
        Boolean(ack),
        'Student acknowledgment should use the existing API',
      );
      await ctx.track(
        'student_policy_acknowledgements',
        ack,
        'policy acknowledgments',
        created,
      );
    }
  }

  for (const [title, read, category, link] of [
    [
      `${PREFIX} Student smoke profile ready`,
      true,
      'ACADEMICS',
      '/student/profile',
    ],
    [`${PREFIX} Coursework reminder`, false, 'ACADEMICS', '/student/courses'],
    [
      `${PREFIX} Review your synthetic fee ledger`,
      false,
      'FINANCE',
      '/student/finance',
    ],
  ]) {
    const match = { tenant_id: ids.tenantId, user_id: ids.studentId, title };
    let row = await existing(ctx, 'falcon_notifications', match);
    if (!row)
      row = await ctx.ensureRow(
        'falcon_notifications',
        {
          ...match,
          category,
          message: `${PREFIX} Only dedicated synthetic test records are referenced by this notification.`,
          action_link: link,
          severity: 'info',
          intent: 'info',
          action_label: 'Open test details',
          metadata: { source: 'student-smoke-v1', synthetic: true },
          is_read: false,
        },
        match,
        'notifications',
      );
    if (read && !row.is_read) {
      await ctx.request(
        actors.student,
        'PATCH',
        `/api/notifications/${row.notification_id}/read`,
      );
      row = await existing(ctx, 'falcon_notifications', match);
    }
    await ctx.track('falcon_notifications', row, 'notifications');
    refs.notifications.push(row.notification_id);
  }
}

async function verifyPortal(ctx, refs) {
  const student = ctx.actors.student;
  const profile = await ctx.request(student, 'GET', '/api/student/profile');
  requireCheck(
    ctx,
    'student profile onboarding',
    profile.onboarding_status === 'COMPLETED',
    'Primary student must complete the real onboarding workflow',
  );
  const required = [
    'name',
    'email',
    'enrollment_no',
    'mobile',
    'blood_group',
    'abc_id',
    'gender',
    'date_of_birth',
    'branch',
    'session',
  ];
  requireCheck(
    ctx,
    'student profile mandatory values',
    required.every((key) => Boolean(profile[key])),
    `Required displayed values: ${required.join(', ')}`,
  );
  requireCheck(
    ctx,
    'student profile guardian and address',
    Boolean(
      profile.parent_details?.father_name &&
      profile.parent_details?.mother_name &&
      profile.parent_details?.emergency_contact_name &&
      profile.parent_details?.emergency_contact_phone &&
      profile.address?.permanent &&
      profile.address?.current,
    ),
    'Required onboarding guardian/address fields must reach the portal',
  );
  const certs = await ctx.request(
    student,
    'GET',
    '/api/academics/certificates/my-certificates',
  );
  requireCheck(
    ctx,
    'student certificate portfolio API',
    refs.certificates.every((id) =>
      certs.some((row) => row.certificate_id === id),
    ),
    'All three legitimate portfolio workflow cases must be visible',
  );
  const tickets = await ctx.request(
    student,
    'GET',
    '/api/helpdesk/tickets/my-tickets',
  );
  requireCheck(
    ctx,
    'student helpdesk API',
    refs.tickets.every((id) => tickets.some((row) => row.ticket_id === id)),
    'All owned tickets must be visible',
  );
  const meetings = await ctx.request(
    student,
    'GET',
    '/api/academics/proctor/meetings/my',
  );
  const leaves = await ctx.request(
    student,
    'GET',
    '/api/academics/proctor/leave-requests/my',
  );
  requireCheck(
    ctx,
    'student mentor meetings API',
    refs.meetings.every((id) => meetings.some((row) => row.meeting_id === id)),
    'Expected approved and pending meetings',
  );
  requireCheck(
    ctx,
    'student mentor leave API',
    refs.leaveRequests.every((id) =>
      leaves.some((row) => row.interaction_id === id),
    ),
    'Expected approved and pending leaves',
  );
  const calendar = await ctx.request(
    student,
    'GET',
    '/api/student/academic-calendar',
  );
  requireCheck(
    ctx,
    'actual student calendar records',
    refs.calendar.every((id) =>
      calendar.events?.some((row) => row.event_id === `university-${id}`),
    ),
    'Only actual inserted event IDs count; generated development fallbacks do not',
  );
  const policies = await ctx.request(student, 'GET', '/api/student/policies');
  requireCheck(
    ctx,
    'student policies API',
    refs.policies.every((id) => policies.some((row) => row.policy_id === id)),
    'Real active policy files must be visible',
  );
  const notifications = await ctx.request(
    student,
    'GET',
    '/api/notifications?limit=100',
  );
  requireCheck(
    ctx,
    'student notifications API',
    refs.notifications.every((id) =>
      notifications.some((row) => row.notification_id === id),
    ),
    'Real own read/unread notifications must be visible',
  );
  for (const course of ctx.ids.courses) {
    const workspace = await ctx.request(
      student,
      'GET',
      `/api/academics/student/courses/${course.course_id}/workspace`,
    );
    const visible =
      workspace.modules?.flatMap((module) => module.materials ?? []) ?? [];
    requireCheck(
      ctx,
      'student course material API',
      visible.some((row) => refs.materials.includes(row.material_id)),
      'Real published section materials must reach the student workspace',
    );
    const announcements = await ctx.request(
      student,
      'GET',
      `/api/academics/student/courses/${course.course_id}/announcements`,
    );
    requireCheck(
      ctx,
      'student course announcement API',
      announcements.some((row) =>
        refs.announcements.includes(row.announcement_id),
      ),
      'Real faculty announcements must reach the student workspace',
    );
  }
}

async function seedPortal(ctx) {
  CREATED_API_ROWS.set(ctx, new Set());
  await assertOwnership(ctx);
  const refs = {
    certificates: [],
    materials: [],
    announcements: [],
    calendar: [],
    policies: [],
    tickets: [],
    meetings: [],
    leaveRequests: [],
    notifications: [],
  };
  ctx.ids.portal = refs;
  await seedMentorship(ctx, refs);
  await seedCertificates(ctx, refs);
  await seedHelpdesk(ctx, refs);
  await seedCalendarPoliciesNotifications(ctx, refs);
  await seedCourseResources(ctx, refs);
  await verifyPortal(ctx, refs);
  ctx.blocked(
    'student library UI',
    'The existing Student Library remains Coming Soon until deliberately launched; the smoke seed does not enable it or create deceptive overdue alerts.',
  );
  ctx.blocked(
    'issued degree / convocation certificate',
    'An active mid-program student cannot legitimately receive a completed degree. Issuance also requires payment, registrar approval and president ratification; no statuses are fabricated.',
  );
  ctx.blocked(
    'student feedback / surveys',
    'No standalone Student feedback or survey implementation was found. The existing policy voting feature is represented without inventing a new survey module.',
  );
  ctx.blocked(
    'optional placement / hostel / transport / research / PhD / competitions',
    'Not seeded by this fixture: these specialized modules require independent eligibility and operational workflows. Empty or unavailable states must be reported separately.',
  );
  return refs;
}

module.exports = { seedPortal, verifyPortal, dateOffset, PREFIX };
