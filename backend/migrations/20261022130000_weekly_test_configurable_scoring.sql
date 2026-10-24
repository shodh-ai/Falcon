-- Existing weekly tests were ten questions scored one mark per correct answer.
-- Keep their historical scale while allowing newly scheduled tests to choose it.
ALTER TABLE weekly_tests
  ADD COLUMN IF NOT EXISTS question_count INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_marks INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS scoring_version SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE weekly_tests
  ADD CONSTRAINT weekly_tests_question_count_range CHECK (question_count BETWEEN 1 AND 100),
  ADD CONSTRAINT weekly_tests_max_marks_range CHECK (max_marks BETWEEN 1 AND 100),
  ADD CONSTRAINT weekly_tests_scoring_version_range CHECK (scoring_version IN (1, 2));
