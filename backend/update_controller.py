import re

with open(r'd:\Falcon\backend\src\modules\academics\academics.controller.ts', 'r', encoding='utf-8') as f:
    content = f.read()

new_method = """
  @Get('hod/courses/:courseId/students')
  @Roles('HOD', 'SuperAdmin')
  hodCourseStudents(@Req() req: { user: AuthUser }, @Param('courseId') courseId: string) {
    return this.academics.listHodCourseStudents(
      this.resolveTenantId(req.user),
      req.user.user_id,
      courseId,
    );
  }
"""

content = content.replace(
    "  @Get('hod/syllabus-coverage')",
    new_method + "\n  @Get('hod/syllabus-coverage')"
)

with open(r'd:\Falcon\backend\src\modules\academics\academics.controller.ts', 'w', encoding='utf-8') as f:
    f.write(content)
