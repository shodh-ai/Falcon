'use client';

import Link from 'next/link';
import {
  FacultyMetricChip,
  FacultyPageHeader,
  FacultyPageShell,
} from '@/components/faculty';
import { FacultyQuestionBankPanel } from '@/components/faculty/FacultyQuestionBankPanel';
import { Button } from '@/components/ui/button';

export default function FacultyQuestionBankPage() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Question Bank"
        description="Build and reuse MCQs across weekly tests and quizzes."
        meta={<FacultyMetricChip label="Module" value="Assessments" emphasis />}
        actions={
          <Button asChild variant="outline">
            <Link href="/faculty/weekly-tests">Weekly Tests</Link>
          </Button>
        }
      />
      <FacultyQuestionBankPanel />
    </FacultyPageShell>
  );
}
