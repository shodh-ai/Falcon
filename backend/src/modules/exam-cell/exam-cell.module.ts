import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { ExamsModule } from '../exams/exams.module';
import { NotificationsModule } from '../../core/notifications/notifications.module';
import { ExamCellController } from './exam-cell.controller';
import { FacultyReEvaluationsController } from './faculty-re-evaluations.controller';
import { ExamCellService } from './exam-cell.service';
import { ResultControlService } from './result-control.service';
import { ExamCellFinanceListener } from './exam-cell-finance.listener';

@Module({
  imports: [FinanceModule, ExamsModule, NotificationsModule],
  controllers: [ExamCellController, FacultyReEvaluationsController],
  providers: [ExamCellService, ResultControlService, ExamCellFinanceListener],
  exports: [ExamCellService, ResultControlService],
})
export class ExamCellModule {}
