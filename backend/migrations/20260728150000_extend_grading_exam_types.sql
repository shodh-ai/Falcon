-- Extend academic_marks exam_type for faculty component-based grading.

ALTER TABLE academic_marks DROP CONSTRAINT IF EXISTS academic_marks_exam_type_check;

ALTER TABLE academic_marks ADD CONSTRAINT academic_marks_exam_type_check
  CHECK (exam_type IN (
    'CAT1', 'CAT2', 'QUIZ', 'END_TERM', 'INTERNAL', 'ASSIGNMENT', 'DA1', 'DA2',
    'WT1', 'WT2', 'GA1', 'GA2',
    'MTE1', 'MTE2', 'MT1', 'MT2', 'ETE',
    'PE1', 'PE2', 'PE3', 'PE4', 'PE5', 'PE6', 'PE7', 'PE8', 'PE9', 'PE10',
    'PROJECT_TITLE', 'PROJECT_PRESENTATION_1', 'PROJECT_PRESENTATION_2',
    'LAB_VIVA', 'MINOR_PRACTICAL', 'MAJOR_PRACTICAL'
  ));
