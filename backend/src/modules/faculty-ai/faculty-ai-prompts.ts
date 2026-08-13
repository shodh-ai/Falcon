export type FacultyPromptTemplate = {
  id: string;
  label: string;
  category: 'academic' | 'student' | 'research' | 'admin' | 'communication';
  prompt: string;
};

export const FACULTY_PROMPT_TEMPLATES: FacultyPromptTemplate[] = [
  {
    id: 'lesson_plan',
    label: 'Generate Lesson Plan',
    category: 'academic',
    prompt:
      "Generate a detailed 50-minute lesson plan for my current course. Include learning objectives (Bloom's levels), warm-up, explanation, activity, assessment checkpoint, and homework. Ask me for the topic if not specified.",
  },
  {
    id: 'weekly_plan',
    label: 'Weekly Teaching Plan',
    category: 'academic',
    prompt:
      'Create a one-week teaching plan (5 sessions) with topics, LTP split, readings, and formative checks aligned to course outcomes.',
  },
  {
    id: 'create_quiz',
    label: 'Create Quiz',
    category: 'academic',
    prompt:
      'Create a 15-question quiz (mix of MCQ and short answer) with an answer key and marking scheme for my course topic.',
  },
  {
    id: 'assignment',
    label: 'Generate Assignment',
    category: 'academic',
    prompt:
      'Draft a digital assignment (DA) with problem statement, deliverables, rubric (10 marks), plagiarism note, and submission deadline guidance.',
  },
  {
    id: 'question_paper',
    label: 'Generate Question Paper',
    category: 'academic',
    prompt:
      'Generate an internal assessment question paper (60 marks, 90 minutes) with CO tags, Bloom levels, and a marking scheme.',
  },
  {
    id: 'mcqs',
    label: 'Generate MCQs',
    category: 'academic',
    prompt:
      'Generate 20 high-quality MCQs with 4 options, correct answer marked, and a one-line rationale for each.',
  },
  {
    id: 'practical',
    label: 'Generate Practical Questions',
    category: 'academic',
    prompt:
      'Generate lab practical questions and viva prompts for a 2-hour lab session, including expected observations and common mistakes.',
  },
  {
    id: 'lab_manual',
    label: 'Prepare Lab Manual',
    category: 'academic',
    prompt:
      'Draft a lab manual experiment sheet: aim, apparatus, theory, procedure, observations table, calculations, result, and precautions.',
  },
  {
    id: 'summarize_notes',
    label: 'Summarize Notes',
    category: 'academic',
    prompt:
      'Summarize the following teaching notes into a one-page study sheet with key formulas, definitions, and exam tips. Paste notes after this message.',
  },
  {
    id: 'translate_notes',
    label: 'Translate Notes',
    category: 'academic',
    prompt:
      'Translate the following academic notes into clear Hindi (with technical terms kept in English in parentheses). Paste notes after this message.',
  },
  {
    id: 'course_outcomes',
    label: 'Create Course Outcomes',
    category: 'academic',
    prompt:
      'Write 5–6 measurable Course Outcomes (COs) using Bloom verbs, suitable for NBA/NAAC documentation for my course.',
  },
  {
    id: 'blooms',
    label: "Generate Bloom's Taxonomy Questions",
    category: 'academic',
    prompt:
      "Generate questions mapped to Bloom's taxonomy levels (Remember → Create) for my topic, 2 questions per level.",
  },
  {
    id: 'rubrics',
    label: 'Generate Rubrics',
    category: 'academic',
    prompt:
      'Create a detailed grading rubric (Excellent / Good / Fair / Poor) for a student project or assignment with weighted criteria totaling 100.',
  },
  {
    id: 'viva',
    label: 'Prepare Viva Questions',
    category: 'academic',
    prompt:
      'Prepare 25 viva voce questions with brief model answers for my subject, progressing from basic to advanced.',
  },
  {
    id: 'student_feedback',
    label: 'Draft Student Feedback',
    category: 'student',
    prompt:
      'Draft constructive written feedback for a student based on attendance, marks, and engagement. Keep tone professional and encouraging.',
  },
  {
    id: 'email',
    label: 'Generate Email',
    category: 'communication',
    prompt:
      'Draft a professional faculty email (subject + body) for the scenario I describe next.',
  },
  {
    id: 'notice',
    label: 'Draft Notice',
    category: 'admin',
    prompt:
      'Draft a formal university/department notice (circular style) with heading, body, action required, and signature block.',
  },
  {
    id: 'meeting_minutes',
    label: 'Meeting Minutes',
    category: 'admin',
    prompt:
      'Format professional meeting minutes with attendees, agenda items, decisions, action items (owner + due date), and next meeting.',
  },
  {
    id: 'research_proposal',
    label: 'Research Proposal',
    category: 'research',
    prompt:
      'Draft a research proposal outline: title, abstract, problem statement, objectives, methodology, expected outcomes, timeline, and references placeholders.',
  },
  {
    id: 'publication_abstract',
    label: 'Publication Abstract',
    category: 'research',
    prompt:
      'Write a 200–250 word publication abstract (IMRaD style) for the research idea I provide.',
  },
  {
    id: 'grant_proposal',
    label: 'Grant Proposal',
    category: 'research',
    prompt:
      'Draft a research grant proposal summary suitable for university R&D: novelty, work plan, budget heads, deliverables, and impact.',
  },
  {
    id: 'review_project',
    label: 'Review Student Project',
    category: 'student',
    prompt:
      'Act as a project guide. Review the student project description I paste and give structured feedback: strengths, gaps, next steps, and evaluation score /100.',
  },
  {
    id: 'weak_students',
    label: 'Identify Weak Students',
    category: 'student',
    prompt:
      'Using my faculty context (attendance / analytics if available), suggest how to identify at-risk students and recommend mentoring interventions. Link relevant Faculty Portal pages.',
  },
  {
    id: 'attendance_warning',
    label: 'Generate Attendance Warnings',
    category: 'student',
    prompt:
      'Draft attendance warning messages for students below 75%, suitable for portal notice and parent communication.',
  },
  {
    id: 'co_po_mapping',
    label: 'Generate CO-PO Mapping',
    category: 'academic',
    prompt:
      'Create a CO–PO mapping matrix (COs vs POs) with correlation levels (1/2/3) and a short justification for each strong mapping.',
  },
  {
    id: 'iqac_doc',
    label: 'IQAC Documentation',
    category: 'admin',
    prompt:
      'Help me draft IQAC evidence narrative for a criterion (ask which criterion). Include what evidence to upload and how to phrase the write-up.',
  },
];

export function getPromptTemplate(id?: string | null) {
  if (!id) return null;
  return FACULTY_PROMPT_TEMPLATES.find((t) => t.id === id) ?? null;
}
