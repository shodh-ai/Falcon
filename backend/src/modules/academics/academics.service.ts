import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject } from '../../entities/subject.entity';
import { Batch } from '../../entities/batch.entity';
import { AttendanceRecord } from '../../entities/attendance-record.entity';
import { ExamResult } from '../../entities/exam-result.entity';
import { GradingPolicy } from '../../entities/grading-policy.entity';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { CreateGradingPolicyDto } from './dto/create-grading-policy.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';

/**
 * NOTE: `markAttendance` writes straight to Postgres for now. When traffic
 * picks up at 9:00 AM lecture starts, swap the body to enqueue a BullMQ job
 * and have a worker flush a Redis buffer in bulk inserts of ~500 rows.
 */
@Injectable()
export class AcademicsService {
  constructor(
    @InjectRepository(Subject) private subjects: Repository<Subject>,
    @InjectRepository(Batch) private batches: Repository<Batch>,
    @InjectRepository(AttendanceRecord) private attendance: Repository<AttendanceRecord>,
    @InjectRepository(ExamResult) private results: Repository<ExamResult>,
    @InjectRepository(GradingPolicy) private gradingPolicies: Repository<GradingPolicy>,
  ) {}

  listSubjects() {
    return this.subjects.find({ order: { subject_code: 'ASC' } });
  }

  createSubject(dto: CreateSubjectDto) {
    return this.subjects.save(this.subjects.create(dto));
  }

  listBatches() {
    return this.batches.find({ order: { academic_year: 'DESC' } });
  }

  async markAttendance(dto: MarkAttendanceDto, markedByUserId: string) {
    const rows = dto.entries.map((entry) =>
      this.attendance.create({
        student_user_id: entry.student_user_id,
        status: entry.status,
        subject_id: dto.subject_id,
        batch_id: dto.batch_id,
        session_date: dto.session_date,
        session_slot: dto.session_slot,
        marked_by_user_id: markedByUserId,
      }),
    );
    return this.attendance.save(rows);
  }

  listResultsForStudent(studentUserId: string) {
    return this.results.find({ where: { student_user_id: studentUserId } });
  }

  listGradingPolicies() {
    return this.gradingPolicies.find({ order: { effective_from: 'DESC' } });
  }

  createGradingPolicy(dto: CreateGradingPolicyDto) {
    return this.gradingPolicies.save(this.gradingPolicies.create(dto));
  }
}
