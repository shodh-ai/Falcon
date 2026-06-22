import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { basename, resolve } from 'path';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DataSource, Repository } from 'typeorm';
import { CourseModule } from '../../entities/course-module.entity';
import { CourseMaterial } from '../../entities/course-material.entity';
import { AcademicCourse } from '../../entities/academic-course.entity';
import { StudentCourseEnrollment } from '../../entities/student-course-enrollment.entity';
import { AcademicTimetable } from '../../entities/academic-timetable.entity';
import { User } from '../../entities/user.entity';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { AssignmentsService } from './assignments.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

@Injectable()
export class CourseLmsService {
  constructor(
    @InjectRepository(CourseModule)
    private readonly modules: Repository<CourseModule>,
    @InjectRepository(CourseMaterial)
    private readonly materials: Repository<CourseMaterial>,
    @InjectRepository(AcademicCourse)
    private readonly courses: Repository<AcademicCourse>,
    @InjectRepository(StudentCourseEnrollment)
    private readonly enrollments: Repository<StudentCourseEnrollment>,
    @InjectRepository(AcademicTimetable)
    private readonly timetables: Repository<AcademicTimetable>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly assignments: AssignmentsService,
    private readonly objectStorage: ObjectStorageService,
    private readonly notificationEmitter: NotificationEmitterService,
  ) {}

  async getFacultyWorkspace(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
  ) {
    await this.assertFacultyTeaches(courseId, facultyUserId, tenantId);
    const course = await this.getCourseOrFail(courseId, tenantId);
    const moduleRows = await this.modules.find({
      where: { tenant_id: tenantId, course_id: courseId },
      order: { module_number: 'ASC' },
    });
    const materials = await this.materials.find({
      where: { tenant_id: tenantId, course_id: courseId },
      order: { uploaded_at: 'DESC' },
    });
    return {
      course,
      syllabus_materials: this.mapMaterials(
        materials.filter((m) => m.material_type === 'SYLLABUS'),
      ),
      modules: moduleRows.map((m) => this.mapModule(m, materials)),
      syllabus_configured: moduleRows.length > 0,
    };
  }

  async setupSyllabus(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    items: {
      module_number: number;
      title: string;
      description?: string;
      planned_completion_date?: string;
    }[],
  ) {
    await this.assertFacultyTeaches(courseId, facultyUserId, tenantId);
    if (!items?.length)
      throw new BadRequestException('At least one module is required');

    await this.modules.delete({ tenant_id: tenantId, course_id: courseId });

    const rows = items.map((item) =>
      this.modules.create({
        tenant_id: tenantId,
        course_id: courseId,
        faculty_user_id: facultyUserId,
        module_number: item.module_number,
        title: item.title.trim(),
        description: item.description?.trim() || null,
        status: 'PENDING',
        planned_completion_date: item.planned_completion_date ?? null,
        hod_approval_status: 'PENDING',
      }),
    );
    await this.modules.save(rows);
    return this.getFacultyWorkspace(facultyUserId, tenantId, courseId);
  }

  async setModuleStatus(
    facultyUserId: string,
    tenantId: string,
    moduleId: string,
    status: 'IN_PROGRESS' | 'PENDING',
  ) {
    const mod = await this.getModuleForFaculty(
      moduleId,
      facultyUserId,
      tenantId,
    );
    if (status === 'IN_PROGRESS') {
      mod.status = 'IN_PROGRESS';
      mod.completed_at = null;
    } else {
      mod.status = 'PENDING';
      mod.completed_at = null;
    }
    await this.modules.save(mod);
    return mod;
  }

  async completeModuleWithUpload(
    facultyUserId: string,
    tenantId: string,
    moduleId: string,
    file: Express.Multer.File,
    dto: { title?: string; material_type?: string },
  ) {
    const mod = await this.getModuleForFaculty(
      moduleId,
      facultyUserId,
      tenantId,
    );
    if (!file)
      throw new BadRequestException(
        'Notes/PPT upload is required when marking a module complete',
      );

    const materialType = (dto.material_type ?? 'NOTES').toUpperCase();
    const stored = await this.persistFile(tenantId, file);
    const material = await this.materials.save(
      this.materials.create({
        tenant_id: tenantId,
        course_id: mod.course_id,
        faculty_user_id: facultyUserId,
        module_id: mod.module_id,
        title: dto.title?.trim() || `${mod.title} — ${materialType}`,
        file_path: stored.filePath,
        file_key: stored.fileKey,
        material_type: materialType,
      }),
    );

    mod.status = 'COMPLETED';
    mod.completed_at = new Date();
    mod.actual_completion_date = new Date().toISOString().slice(0, 10);
    await this.modules.save(mod);

    const course = await this.getCourseOrFail(mod.course_id, tenantId);
    await this.notifyEnrolledStudents(
      tenantId,
      mod.course_id,
      course.course_name,
      material.title,
    );

    return { module: mod, material };
  }

  async addModule(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    dto: { title: string; module_number?: number },
  ) {
    await this.assertFacultyTeaches(courseId, facultyUserId, tenantId);
    if (!dto.title?.trim())
      throw new BadRequestException('Module title is required');

    const existing = await this.modules.find({
      where: { tenant_id: tenantId, course_id: courseId },
      order: { module_number: 'DESC' },
      take: 1,
    });
    const nextNumber =
      dto.module_number ?? (existing[0]?.module_number ?? 0) + 1;

    const mod = await this.modules.save(
      this.modules.create({
        tenant_id: tenantId,
        course_id: courseId,
        faculty_user_id: facultyUserId,
        module_number: nextNumber,
        title: dto.title.trim(),
        description: null,
        status: 'PENDING',
      }),
    );
    return mod;
  }

  async uploadModuleMaterial(
    facultyUserId: string,
    tenantId: string,
    moduleId: string,
    file: Express.Multer.File,
    dto: { title?: string; material_type?: string },
  ) {
    const mod = await this.getModuleForFaculty(
      moduleId,
      facultyUserId,
      tenantId,
    );
    if (!file) throw new BadRequestException('File is required');

    const course = await this.getCourseOrFail(mod.course_id, tenantId);
    const materialType = (dto.material_type ?? 'NOTES').toUpperCase();
    const stored = await this.persistFile(tenantId, file);
    const material = await this.materials.save(
      this.materials.create({
        tenant_id: tenantId,
        course_id: mod.course_id,
        faculty_user_id: facultyUserId,
        module_id: mod.module_id,
        title: dto.title?.trim() || `${mod.title} — ${materialType}`,
        file_path: stored.filePath,
        file_key: stored.fileKey,
        material_type: materialType,
      }),
    );

    await this.notifyEnrolledStudents(
      tenantId,
      mod.course_id,
      course.course_name,
      material.title,
    );

    return { module: mod, material };
  }

  async uploadModuleMaterials(
    facultyUserId: string,
    tenantId: string,
    moduleId: string,
    files: Express.Multer.File[],
    dto: { title?: string; material_type?: string },
  ) {
    const mod = await this.getModuleForFaculty(
      moduleId,
      facultyUserId,
      tenantId,
    );
    if (!files?.length)
      throw new BadRequestException('At least one file is required');

    const course = await this.getCourseOrFail(mod.course_id, tenantId);
    const materialType = (dto.material_type ?? 'NOTES').toUpperCase();
    const materials = await Promise.all(
      files.map(async (file) => {
        const stored = await this.persistFile(tenantId, file);
        return this.materials.save(
          this.materials.create({
            tenant_id: tenantId,
            course_id: mod.course_id,
            faculty_user_id: facultyUserId,
            module_id: mod.module_id,
            title:
              files.length === 1 && dto.title?.trim()
                ? dto.title.trim()
                : file.originalname.replace(/\.[^.]+$/, ''),
            file_path: stored.filePath,
            file_key: stored.fileKey,
            material_type: materialType,
          }),
        );
      }),
    );

    await Promise.all(
      materials.map((material) =>
        this.notifyEnrolledStudents(
          tenantId,
          mod.course_id,
          course.course_name,
          material.title,
        ),
      ),
    );

    return { module: mod, materials };
  }

  async uploadCourseSyllabus(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    file: Express.Multer.File,
    dto: { title?: string },
  ) {
    await this.assertFacultyTeaches(courseId, facultyUserId, tenantId);
    if (!file) throw new BadRequestException('Syllabus file is required');
    const course = await this.getCourseOrFail(courseId, tenantId);
    const stored = await this.persistFile(tenantId, file);
    const material = await this.materials.save(
      this.materials.create({
        tenant_id: tenantId,
        course_id: courseId,
        faculty_user_id: facultyUserId,
        module_id: null,
        title: dto.title?.trim() || 'Course Syllabus & Lesson Plan',
        file_path: stored.filePath,
        file_key: stored.fileKey,
        material_type: 'SYLLABUS',
      }),
    );
    await this.notifyEnrolledStudents(
      tenantId,
      courseId,
      course.course_name,
      material.title,
    );
    return { material };
  }

  async getStudentWorkspace(
    studentUserId: string,
    tenantId: string,
    courseId: string,
  ) {
    const enrollment = await this.enrollments
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.course', 'course')
      .where('e.tenant_id = :tenantId', { tenantId })
      .andWhere('e.student_user_id = :studentUserId', { studentUserId })
      .andWhere('e.course_id = :courseId', { courseId })
      .andWhere('e.status IN (:...statuses)', {
        statuses: ['ENROLLED', 'COMPLETED'],
      })
      .getOne();
    if (!enrollment)
      throw new ForbiddenException('You are not enrolled in this course');

    const modules = await this.modules.find({
      where: { tenant_id: tenantId, course_id: courseId },
      order: { module_number: 'ASC' },
    });
    const materials = await this.materials.find({
      where: { tenant_id: tenantId, course_id: courseId },
    });

    const completed = modules.filter((m) => m.status === 'COMPLETED').length;
    const total = modules.length;

    const assignmentList = await this.assignments.listStudentAssignments(
      studentUserId,
      tenantId,
    );
    const courseAssignments = assignmentList.filter(
      (row: { assignment: { course_id?: string } }) =>
        row.assignment.course_id === courseId,
    );

    return {
      course: enrollment.course,
      enrollment: {
        semester: enrollment.semester,
        status: enrollment.status,
        grade: enrollment.grade,
        attendance_percent: Number(enrollment.attendance_percent),
      },
      syllabus_progress: {
        completed,
        total,
        percent: total > 0 ? Math.round((completed / total) * 100) : 0,
      },
      modules: modules.map((m) => this.mapModule(m, materials)),
      syllabus_materials: this.mapMaterials(
        materials.filter((m) => m.material_type === 'SYLLABUS'),
      ),
      assignments: courseAssignments,
    };
  }

  async deleteCourseMaterial(
    facultyUserId: string,
    tenantId: string,
    materialId: string,
  ) {
    const material = await this.materials.findOne({
      where: { material_id: materialId, tenant_id: tenantId },
    });
    if (!material) throw new NotFoundException('Material not found');

    const ownsMaterial = material.faculty_user_id === facultyUserId;
    if (!ownsMaterial) {
      try {
        await this.assertFacultyTeaches(
          material.course_id,
          facultyUserId,
          tenantId,
        );
      } catch {
        throw new ForbiddenException('You cannot delete this material');
      }
    }

    await this.removeStoredFile(material);
    await this.materials.remove(material);
    return { deleted: true, material_id: materialId };
  }

  async getMaterialForStudentDownload(
    studentUserId: string,
    tenantId: string,
    materialId: string,
  ) {
    const material = await this.materials.findOne({
      where: { material_id: materialId, tenant_id: tenantId },
    });
    if (!material) throw new NotFoundException('Material not found');

    const enrolled = await this.enrollments.findOne({
      where: {
        tenant_id: tenantId,
        student_user_id: studentUserId,
        course_id: material.course_id,
      },
    });
    if (!enrolled) throw new ForbiddenException('Not enrolled in this course');

    return material;
  }

  async streamMaterialDownload(material: CourseMaterial) {
    if (material.file_key && this.objectStorage.isEnabled()) {
      const stream = await this.objectStorage.getDownloadStream(
        material.file_key,
      );
      return {
        stream,
        filename: basename(material.file_key),
        mimeType: 'application/pdf',
      };
    }
    const uploadRoot = resolve(process.env.UPLOAD_PATH || './uploads');
    const filePath = material.file_path.startsWith('/')
      ? material.file_path
      : resolve(process.cwd(), material.file_path);
    const resolved = filePath.includes(uploadRoot)
      ? filePath
      : resolve(uploadRoot, material.file_path);
    if (!existsSync(resolved))
      throw new NotFoundException('File not found on server');
    return {
      stream: createReadStream(resolved),
      filename: basename(resolved),
      mimeType: 'application/pdf',
    };
  }

  private mapModule(mod: CourseModule, materials: CourseMaterial[]) {
    const linked = materials.filter(
      (m) => m.module_id === mod.module_id && m.material_type !== 'SYLLABUS',
    );
    return {
      module_id: mod.module_id,
      module_number: mod.module_number,
      title: mod.title,
      description: mod.description,
      status: mod.status,
      completed_at: mod.completed_at,
      planned_completion_date: mod.planned_completion_date,
      actual_completion_date: mod.actual_completion_date,
      hod_approval_status: mod.hod_approval_status,
      materials: this.mapMaterials(linked),
    };
  }

  private mapMaterials(materials: CourseMaterial[]) {
    return materials.map((m) => ({
      material_id: m.material_id,
      title: m.title,
      material_type: m.material_type,
      uploaded_at: m.uploaded_at,
    }));
  }

  private async getCourseOrFail(courseId: string, tenantId: string) {
    const course = await this.courses.findOne({
      where: { course_id: courseId, tenant_id: tenantId },
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  private async assertFacultyTeaches(
    courseId: string,
    facultyUserId: string,
    tenantId: string,
  ) {
    const row = await this.timetables.findOne({
      where: {
        tenant_id: tenantId,
        course_id: courseId,
        faculty_user_id: facultyUserId,
      },
    });
    if (!row)
      throw new NotFoundException(
        'Course not found in your teaching timetable',
      );
  }

  private async getModuleForFaculty(
    moduleId: string,
    facultyUserId: string,
    tenantId: string,
  ) {
    const mod = await this.modules.findOne({
      where: {
        module_id: moduleId,
        tenant_id: tenantId,
        faculty_user_id: facultyUserId,
      },
    });
    if (!mod) throw new NotFoundException('Module not found');
    return mod;
  }

  private async notifyEnrolledStudents(
    tenantId: string,
    courseId: string,
    courseName: string,
    materialTitle: string,
  ) {
    const enrolled = await this.enrollments.find({
      where: { tenant_id: tenantId, course_id: courseId, status: 'ENROLLED' },
      select: ['student_user_id'],
    });
    for (const row of enrolled) {
      this.notificationEmitter.courseMaterialAdded({
        tenantId,
        userId: row.student_user_id,
        courseId,
        courseName,
        materialTitle,
      });
    }
  }

  private async removeStoredFile(material: CourseMaterial) {
    if (material.file_key && this.objectStorage.isEnabled()) {
      return;
    }
    const uploadRoot = resolve(process.env.UPLOAD_PATH || './uploads');
    const filePath = material.file_path.startsWith('/')
      ? material.file_path
      : resolve(process.cwd(), material.file_path);
    const resolved = filePath.includes(uploadRoot)
      ? filePath
      : resolve(uploadRoot, material.file_path);
    if (existsSync(resolved)) {
      try {
        unlinkSync(resolved);
      } catch {
        /* best-effort disk cleanup */
      }
    }
  }

  private async persistFile(tenantId: string, file: Express.Multer.File) {
    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
    if (this.objectStorage.isEnabled()) {
      const key = this.objectStorage.buildKey(
        tenantId,
        `course-materials/${uniqueName}`,
      );
      const stored = await this.objectStorage.upload(
        tenantId,
        key,
        file.buffer,
        file.mimetype,
      );
      return { filePath: stored.url, fileKey: stored.key };
    }
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    const targetDir = join(uploadPath, tenantId, 'course-materials');
    mkdirSync(targetDir, { recursive: true });
    const fullPath = join(targetDir, uniqueName);
    writeFileSync(fullPath, file.buffer);
    return { filePath: fullPath, fileKey: null };
  }

  async approveModulePlan(
    hodUserId: string,
    tenantId: string,
    moduleId: string,
    action: 'APPROVE' | 'REJECT',
  ) {
    const mod = await this.modules.findOne({
      where: { module_id: moduleId, tenant_id: tenantId },
    });
    if (!mod) throw new NotFoundException('Module not found');
    mod.hod_approval_status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await this.modules.save(mod);
    return mod;
  }

  async listStudyGroups(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
  ) {
    await this.assertFacultyTeaches(courseId, facultyUserId, tenantId);
    return this.dataSource.query(
      `SELECT g.*, COUNT(m.member_id)::int AS member_count
       FROM course_study_groups g
       LEFT JOIN course_study_group_members m ON m.group_id = g.group_id
       WHERE g.tenant_id = $1 AND g.course_id = $2
       GROUP BY g.group_id
       ORDER BY g.created_at ASC`,
      [tenantId, courseId],
    );
  }

  async createStudyGroup(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    dto: {
      group_name: string;
      is_compulsory?: boolean;
      student_user_ids?: string[];
    },
  ) {
    await this.assertFacultyTeaches(courseId, facultyUserId, tenantId);
    const rows = await this.dataSource.query(
      `INSERT INTO course_study_groups (tenant_id, course_id, faculty_user_id, group_name, is_compulsory)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [
        tenantId,
        courseId,
        facultyUserId,
        dto.group_name.trim(),
        dto.is_compulsory ?? true,
      ],
    );
    const group = rows[0];
    if (dto.student_user_ids?.length) {
      for (const studentUserId of dto.student_user_ids) {
        await this.dataSource.query(
          `INSERT INTO course_study_group_members (tenant_id, group_id, student_user_id)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [tenantId, group.group_id, studentUserId],
        );
      }
    }
    return group;
  }

  async joinStudyGroup(
    studentUserId: string,
    tenantId: string,
    groupId: string,
  ) {
    const group = await this.dataSource.query(
      `SELECT * FROM course_study_groups WHERE group_id = $1 AND tenant_id = $2`,
      [groupId, tenantId],
    );
    if (!group[0]) throw new NotFoundException('Study group not found');
    if (group[0].is_compulsory)
      throw new BadRequestException(
        'This group is compulsory — you are auto-assigned',
      );

    await this.dataSource.query(
      `INSERT INTO course_study_group_members (tenant_id, group_id, student_user_id)
       VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [tenantId, groupId, studentUserId],
    );
    return { joined: true };
  }

  async listStudentStudyGroups(
    studentUserId: string,
    tenantId: string,
    courseId: string,
  ) {
    return this.dataSource.query(
      `SELECT g.*,
              EXISTS (
                SELECT 1 FROM course_study_group_members m
                WHERE m.group_id = g.group_id AND m.student_user_id = $3
              ) AS is_member
       FROM course_study_groups g
       WHERE g.tenant_id = $1 AND g.course_id = $2
       ORDER BY g.group_name ASC`,
      [tenantId, courseId, studentUserId],
    );
  }

  async uploadGroupMaterial(
    facultyUserId: string,
    tenantId: string,
    groupId: string,
    file: Express.Multer.File,
    dto: { title?: string; material_type?: string },
  ) {
    const group = await this.dataSource.query(
      `SELECT * FROM course_study_groups WHERE group_id = $1 AND tenant_id = $2 AND faculty_user_id = $3`,
      [groupId, tenantId, facultyUserId],
    );
    if (!group[0]) throw new NotFoundException('Study group not found');
    const stored = await this.persistFile(tenantId, file);
    const material = await this.materials.save(
      this.materials.create({
        tenant_id: tenantId,
        course_id: group[0].course_id,
        faculty_user_id: facultyUserId,
        title: dto.title?.trim() || file.originalname,
        file_path: stored.filePath,
        file_key: stored.fileKey,
        material_type: (dto.material_type ?? 'NOTES').toUpperCase(),
        study_group_id: groupId,
      }),
    );
    return material;
  }
}
