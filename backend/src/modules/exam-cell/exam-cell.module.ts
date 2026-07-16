import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { ExamsModule } from '../exams/exams.module';
import { NotificationsModule } from '../../core/notifications/notifications.module';
import { AttendancePolicyModule } from '../attendance-policy/attendance-policy.module';
import { ExamCellController } from './exam-cell.controller';
import { FacultyReEvaluationsController } from './faculty-re-evaluations.controller';
import { ExamCellService } from './exam-cell.service';
import { ResultControlService } from './result-control.service';
import { SemesterResultsService } from './semester-results.service';
import { ExamCellFinanceListener } from './exam-cell-finance.listener';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { ExamCellSessionsService } from './exam-cell-sessions.service';
import { ExamCellOperationsService } from './exam-cell-operations.service';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';
import { ExamCellDevService } from './exam-cell-dev.service';

@Module({
  imports: [
    FinanceModule,
    ExamsModule,
    NotificationsModule,
    AttendancePolicyModule,
  ],
  controllers: [ExamCellController, FacultyReEvaluationsController],
  providers: [
    ExamCellService,
    ResultControlService,
    SemesterResultsService,
    ExamCellFinanceListener,
    ExamCellAuditService,
    ExamCellSessionsService,
    ExamCellOperationsService,
    ExamCellEnterpriseService,
    ExamCellDevService,
  ],
  exports: [
    ExamCellService,
    ResultControlService,
    SemesterResultsService,
    ExamCellAuditService,
    ExamCellOperationsService,
    ExamCellEnterpriseService,
    ExamCellDevService,
  ],
})
export class ExamCellModule {}
