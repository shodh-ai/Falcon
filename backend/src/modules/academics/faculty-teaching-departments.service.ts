import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type TeachingDepartment = {
  dept_id: number;
  dept_name: string;
  course_count: number;
  weekly_hours: number;
};

export type TeachingDepartmentsResult = {
  is_multi_department: boolean;
  home_dept_id: number | null;
  departments: TeachingDepartment[];
};

/** Shared SQL: resolve dept_id per active faculty allocation. */
export const ALLOCATION_WITH_DEPT_FROM = `
  FROM academic_course_allocations a
  INNER JOIN users u ON u.user_id = a.faculty_user_id
  LEFT JOIN academic_courses c ON c.course_id = a.course_id AND c.tenant_id = a.tenant_id
  LEFT JOIN iam_programs p
    ON p.deleted_at IS NULL
   AND (
     upper(replace(COALESCE(p.program_name, ''), ' ', '')) = upper(replace(COALESCE(a.program_name, ''), ' ', ''))
     OR upper(replace(COALESCE(p.program_code, ''), ' ', '')) = upper(replace(COALESCE(a.program_name, ''), ' ', ''))
   )
  LEFT JOIN LATERAL (
    SELECT d.dept_id
    FROM departments d
    WHERE d.dept_name = CASE
      WHEN c.course_code LIKE 'ME%' OR c.course_code LIKE 'DME%' THEN 'Mech Engg'
      WHEN c.course_code LIKE 'EE%' THEN 'Electrical Engg'
      WHEN c.course_code LIKE 'CE%' THEN 'Civil'
      WHEN c.course_code LIKE 'BP%' THEN 'Pharmacy'
      WHEN c.course_code LIKE 'BPT%' THEN 'BPT'
      WHEN c.course_code LIKE 'CP%' OR c.course_code LIKE 'CS%' THEN 'Computer Science'
      WHEN c.course_code LIKE 'SAS%' THEN 'Applied Sciences'
      ELSE NULL
    END
    LIMIT 1
  ) code_dept ON true
`;

@Injectable()
export class FacultyTeachingDepartmentsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** CTE body: distinct course_ids for faculty, optionally filtered by dept. */
  facultyCoursesCte(deptParamIndex = 3): string {
    return `faculty_courses AS (
      SELECT DISTINCT a.course_id
      ${ALLOCATION_WITH_DEPT_FROM}
      WHERE a.tenant_id = $1
        AND a.faculty_user_id = $2
        AND a.status = 'ACTIVE'
        AND a.course_id IS NOT NULL
        AND ($${deptParamIndex}::int IS NULL OR COALESCE(p.dept_id, code_dept.dept_id, u.dept_id) = $${deptParamIndex})
    )`;
  }

  async getTeachingDepartments(
    facultyUserId: string,
    tenantId: string,
  ): Promise<TeachingDepartmentsResult> {
    const homeRows = await this.dataSource.query<
      Array<{ dept_id: number | null }>
    >(`SELECT dept_id FROM users WHERE user_id = $1`, [facultyUserId]);
    const homeDeptId = homeRows[0]?.dept_id ?? null;

    const deptRows = await this.dataSource.query<
      Array<{
        dept_id: number;
        dept_name: string;
        course_count: string;
        weekly_hours: string;
      }>
    >(
      `WITH allocation_depts AS (
         SELECT
           a.course_id,
           COALESCE(p.dept_id, code_dept.dept_id, u.dept_id) AS dept_id
         ${ALLOCATION_WITH_DEPT_FROM}
         WHERE a.tenant_id = $1
           AND a.faculty_user_id = $2
           AND a.status = 'ACTIVE'
           AND a.course_id IS NOT NULL
       ),
       dept_courses AS (
         SELECT ad.dept_id, ad.course_id
         FROM allocation_depts ad
         WHERE ad.dept_id IS NOT NULL
       ),
       slot_hours AS (
         SELECT
           dc.dept_id,
           COALESCE(
             SUM(
               EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 3600.0
             ),
             0
           ) AS weekly_hours
         FROM dept_courses dc
         LEFT JOIN academic_timetables t
           ON t.course_id = dc.course_id
          AND t.tenant_id = $1
          AND t.faculty_user_id = $2
          AND t.deleted_at IS NULL
         GROUP BY dc.dept_id
       )
       SELECT
         d.dept_id,
         d.dept_name,
         COUNT(DISTINCT dc.course_id)::text AS course_count,
         COALESCE(sh.weekly_hours, 0)::text AS weekly_hours
       FROM dept_courses dc
       INNER JOIN departments d ON d.dept_id = dc.dept_id
       LEFT JOIN slot_hours sh ON sh.dept_id = dc.dept_id
       GROUP BY d.dept_id, d.dept_name, sh.weekly_hours
       ORDER BY d.dept_name`,
      [tenantId, facultyUserId],
    );

    const departments: TeachingDepartment[] = deptRows.map((row) => ({
      dept_id: Number(row.dept_id),
      dept_name: row.dept_name,
      course_count: Number(row.course_count),
      weekly_hours: Math.round(Number(row.weekly_hours) * 10) / 10,
    }));

    return {
      is_multi_department: departments.length >= 2,
      home_dept_id: homeDeptId,
      departments,
    };
  }

  async assertTeachesInDepartment(
    facultyUserId: string,
    tenantId: string,
    deptId: number,
  ): Promise<void> {
    const result = await this.getTeachingDepartments(facultyUserId, tenantId);
    const allowed = result.departments.some((d) => d.dept_id === deptId);
    if (!allowed) {
      throw new ForbiddenException(
        'You do not teach in the selected department',
      );
    }
  }

  resolveOptionalDeptId(raw?: string): number | null {
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
