import re

with open(r'd:\Falcon\backend\src\modules\academics\academics.service.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add course_id to syllabus coverage query
content = content.replace(
    "SELECT c.course_code, c.course_name, u.name AS faculty_name,",
    "SELECT c.course_id, c.course_code, c.course_name, u.name AS faculty_name,"
)

# 2. Add course_id to result analytics query
content = content.replace(
    "SELECT c.course_code, c.course_name,",
    "SELECT c.course_id, c.course_code, c.course_name,"
)

# 3. Add course_id to map for both
content = re.sub(
    r'(return \{\s*)course_code: row.course_code,(\s*course_name: row.course_name,)',
    r'\1course_id: row.course_id as string,\n        course_code: row.course_code,\2',
    content
)

# 4. Add listHodCourseStudents method
new_method = """
  async listHodCourseStudents(tenantId: string, hodUserId: string, courseId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (!deptIds.length) return [];

    return this.users.manager.query(
      `SELECT u.user_id, u.name, u.official_email AS email, u.enrollment_no,
              e.attendance_percent, e.grade_points, e.status
       FROM student_course_enrollments e
       INNER JOIN users u ON u.user_id = e.student_user_id
       WHERE e.tenant_id = $1 AND e.course_id = $2 AND u.dept_id = ANY($3::int[])
       ORDER BY u.name ASC`,
      [tenantId, courseId, deptIds],
    );
  }
"""
content = content.replace("  async listHodGrievances(tenantId: string, hodUserId: string) {", new_method + "\n  async listHodGrievances(tenantId: string, hodUserId: string) {")

with open(r'd:\Falcon\backend\src\modules\academics\academics.service.ts', 'w', encoding='utf-8') as f:
    f.write(content)
