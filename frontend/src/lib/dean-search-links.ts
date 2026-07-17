export type DeanSearchResult = {
  id: string;
  name: string;
  subtitle: string;
  type: string;
};

export function deanSearchResultHref(row: DeanSearchResult): string | null {
  switch (row.type) {
    case 'student':
      return `/dean/students/monitor?student=${encodeURIComponent(row.id)}`;
    case 'faculty':
      return `/dean/faculty/workload?faculty=${encodeURIComponent(row.id)}`;
    case 'department':
      return `/dean/departments/${encodeURIComponent(row.id)}`;
    case 'course':
      return `/dean/academics/course-allocation?course=${encodeURIComponent(row.id)}`;
    case 'research':
      return `/dean/research?project=${encodeURIComponent(row.id)}`;
    case 'event':
      return `/dean/events?event=${encodeURIComponent(row.id)}`;
    case 'meeting':
      return `/dean/meetings?meeting=${encodeURIComponent(row.id)}`;
    case 'approval':
      return `/dean/inbox?funding=${encodeURIComponent(row.id)}`;
    default:
      return null;
  }
}
