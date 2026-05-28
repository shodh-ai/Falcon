/**
 * Phase 2 — AI extraction rules (CSV-aligned).
 * Rules match `task_name` via case-insensitive substring checks (first match wins; list order = specificity).
 */
export interface ExtractionRule {
  matchContains: string[];
  /** If true, every phrase in matchContains must appear in task_name (reduces false positives). */
  matchAll?: boolean;
  taskLabel: string;
  /** JSON keys for extracted_data when is_valid is true; values describe type + meaning for Gemini */
  extractionFields: Record<string, string>;
  /** Extra instructions appended to the Gemini prompt (task-specific validation flexibility). */
  validationNotes?: string;
}

export const EXTRACTION_RULES: ExtractionRule[] = [
  {
    matchContains: ['activity', 'geotag'],
    matchAll: true,
    taskLabel: 'Activity Reports with geotagged photographs',
    extractionFields: {
      event_name: '(String) The title of the event/activity.',
      event_date: '(String) Date the event took place.',
      department: '(String) Which department organized it.',
      number_of_participants: '(Number) Total students/staff who attended.',
      key_outcome: "(String) A 1-sentence summary of the event's outcome.",
    },
    validationNotes:
      'Note: Do NOT fail the validation if photographs or images are missing. Consider the document VALIDATED as long as it contains the required event details (Event Name, Date, Department, Attendees / number of participants). A text-only activity report is acceptable.',
  },
  {
    matchContains: ['dapc'],
    taskLabel: 'DAPC Meetings (Notification/ MoM)',
    extractionFields: {
      meeting_date: '(String) The date the DAPC meeting was held.',
      total_attendees: '(Number) How many members were present.',
      key_decisions: '(Array of Strings) Top 3 decisions made or points discussed.',
      next_meeting_date: '(String) When the next meeting is scheduled (if mentioned).',
    },
  },
  {
    matchContains: ['class audit'],
    taskLabel: 'Class Audit Reports',
    extractionFields: {
      auditor_name: '(String) Name of the person conducting the audit.',
      faculty_audited: '(String) Name of the teacher being audited.',
      course_name: '(String) Subject/Course being taught.',
      overall_score: '(String) The final rating, grade, or percentage given.',
    },
  },
  {
    matchContains: ['student reports', 'lab'],
    matchAll: true,
    taskLabel: 'Submission of Student Reports (Lab/Internship/Field)',
    extractionFields: {
      student_batch: '(String) The semester/batch of the students.',
      project_type: '(String) Is this an Internship, Field Visit, or Lab Project?',
      industry_partner:
        '(String) Name of the company visited or partnered with (if applicable).',
    },
  },
  {
    matchContains: ['curriculum feedback'],
    taskLabel: 'Curriculum Feedback Analysis',
    extractionFields: {
      stakeholder_group:
        '(String) Is this feedback from Students, Alumni, Parents, or Employers?',
      major_suggestion:
        '(String) A 1-sentence summary of the most common improvement suggested.',
    },
  },
];

const DEFAULT_FIELDS: Record<string, string> = {
  document_title: '(String) Main title or heading of the document.',
  document_summary: '(String) One sentence describing what the document is.',
  primary_date: '(String) The most relevant date visible on the document, if any.',
};

export function pickExtractionRule(taskName: string): {
  taskLabel: string;
  extractionFields: Record<string, string>;
  validationNotes?: string;
} {
  const lower = taskName.toLowerCase();
  for (const rule of EXTRACTION_RULES) {
    const keys = rule.matchContains.map((k) => k.toLowerCase());
    const matches = rule.matchAll
      ? keys.every((k) => lower.includes(k))
      : keys.some((k) => lower.includes(k));
    if (matches) {
      return {
        taskLabel: rule.taskLabel,
        extractionFields: rule.extractionFields,
        validationNotes: rule.validationNotes,
      };
    }
  }
  return { taskLabel: taskName, extractionFields: DEFAULT_FIELDS };
}
