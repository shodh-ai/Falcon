import { Module } from '@nestjs/common';
import { ExamCellController } from './exam-cell.controller';
import { ExamCellService } from './exam-cell.service';

@Module({
  controllers: [ExamCellController],
  providers: [ExamCellService],
})
export class ExamCellModule {}
