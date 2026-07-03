import re

with open(r'd:\Falcon\frontend\src\app\(portals)\hod\academics\result-analytics\page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
content = content.replace(
    "import { useAuthedApi } from '@/lib/api';",
    "import { useAuthedApi } from '@/lib/api';\nimport { CourseEnrolledStudentsModal } from '@/components/hod/CourseEnrolledStudentsModal';"
)

# Update Row type
content = content.replace(
    "type Row = {\n  course_code: string;",
    "type Row = {\n  course_id: string;\n  course_code: string;"
)

# Add state
state_code = """
  const api = useAuthedApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCourseName, setSelectedCourseName] = useState<string | null>(null);
"""
content = content.replace(
    "  const api = useAuthedApi();\n  const [rows, setRows] = useState<Row[]>([]);\n  const [loading, setLoading] = useState(true);",
    state_code
)

# Add onRowClick
content = content.replace(
    "        rowKey={(r) => r.course_code}",
    "        rowKey={(r) => r.course_code}\n        onRowClick={(r) => {\n          setSelectedCourseId(r.course_id);\n          setSelectedCourseName(r.course_name);\n        }}"
)

# Add Modal component before closing tag
modal_code = """
      <CourseEnrolledStudentsModal
        courseId={selectedCourseId}
        courseName={selectedCourseName}
        open={!!selectedCourseId}
        onOpenChange={(open) => !open && setSelectedCourseId(null)}
      />
    </HodPageFrame>
"""
content = content.replace(
    "    </HodPageFrame>",
    modal_code
)

with open(r'd:\Falcon\frontend\src\app\(portals)\hod\academics\result-analytics\page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
