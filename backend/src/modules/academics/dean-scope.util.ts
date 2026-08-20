type Queryable = {
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<T>;
};

export type DeanScope = {
  schoolIds: number[];
  departmentIds: number[];
  schools: Array<{
    school_id: number;
    school_name: string;
    school_code: string | null;
  }>;
};

/** Resolve school + department scope for a Dean (or HOD acting as Dean). */
export async function resolveDeanScope(
  db: Queryable,
  deanUserId: string,
): Promise<DeanScope> {
  const schoolRows = await db.query<
    Array<{
      school_id: number;
      school_name: string;
      school_code: string | null;
    }>
  >(
    `SELECT DISTINCT s.school_id, s.school_name, s.school_code
     FROM schools s
     WHERE s.deleted_at IS NULL
       AND (
         s.dean_user_id = $1
         OR EXISTS (
           SELECT 1 FROM departments d
           WHERE d.hod_user_id = $1 AND d.school_id = s.school_id
         )
       )`,
    [deanUserId],
  );
  const schoolIds = schoolRows.map((row) => Number(row.school_id));
  let departmentIds: number[] = [];

  if (schoolIds.length) {
    const deptRows = await db.query<Array<{ dept_id: number }>>(
      `SELECT DISTINCT dept_id
       FROM (
         SELECT dept_id
         FROM iam_programs
         WHERE school_id = ANY($1::int[])
           AND dept_id IS NOT NULL
           AND deleted_at IS NULL
         UNION
         SELECT dept_id
         FROM departments
         WHERE school_id = ANY($1::int[])
           AND dept_id IS NOT NULL
       ) scoped`,
      [schoolIds],
    );
    departmentIds = deptRows.map((row) => Number(row.dept_id));
  }

  const hodDeptRows = await db.query<Array<{ dept_id: number }>>(
    `SELECT dept_id FROM departments WHERE hod_user_id = $1`,
    [deanUserId],
  );
  departmentIds = Array.from(
    new Set([
      ...departmentIds,
      ...hodDeptRows.map((row) => Number(row.dept_id)),
    ]),
  );

  const deanRow = await db.query<Array<{ dept_id: number | null }>>(
    `SELECT dept_id FROM users WHERE user_id = $1 LIMIT 1`,
    [deanUserId],
  );
  if (deanRow[0]?.dept_id) {
    departmentIds = Array.from(
      new Set([...departmentIds, Number(deanRow[0].dept_id)]),
    );
  }

  return {
    schoolIds,
    departmentIds,
    schools: schoolRows.map((row) => ({
      school_id: Number(row.school_id),
      school_name: String(row.school_name),
      school_code: row.school_code ? String(row.school_code) : null,
    })),
  };
}

export async function resolveDeanDepartmentIds(
  db: Queryable,
  deanUserId: string,
): Promise<number[]> {
  const scope = await resolveDeanScope(db, deanUserId);
  return scope.departmentIds;
}

export function isDepartmentInDeanScope(
  deptId: number | null | undefined,
  departmentIds: number[],
): boolean {
  if (deptId == null) return false;
  return departmentIds.includes(Number(deptId));
}
