import { allocationDepartmentScope, enrolledDepartmentScope } from './department-course-scope';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
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
import { resolve } from 'path';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { CourseModule } from '../../entities/course-module.entity';
import { CourseMaterial } from '../../entities/course-material.entity';
import { CourseMaterialVisibility } from '../../entities/course-material-visibility.entity';
import { CourseAllocation } from '../../entities/course-allocation.entity';
import { AcademicCourse } from '../../entities/academic-course.entity';
import { StudentCourseEnrollment } from '../../entities/student-course-enrollment.entity';
import { AcademicTimetable } from '../../entities/academic-timetable.entity';
import { User } from '../../entities/user.entity';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { AssignmentsService } from './assignments.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { FalconNotificationsService } from '../../core/notifications/falcon-notifications.service';
import { materialDownloadMetadata } from './material-download';
import { normalizeYouTubeMaterialUrl } from './youtube-material';

@Injectable()
export class CourseLmsService {
  private readonly logger = new Logger(CourseLmsService.name);

  constructor(
    @InjectRepository(CourseModule)
    private readonly modules: Repository<CourseModule>,
    @InjectRepository(CourseMaterial)
    private readonly materials: Repository<CourseMaterial>,
    @InjectRepository(CourseMaterialVisibility)
    private readonly materialVisibility: Repository<CourseMaterialVisibility>,
    @InjectRepository(CourseAllocation)
    private readonly allocations: Repository<CourseAllocation>,
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
    private readonly falconNotifications: FalconNotificationsService,
  ) {}

  async getFacultyWorkspace(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
  ) {
    await this.assertFacultyTeaches(courseId, facultyUserId, tenantId);
    return this.loadCourseWorkspace(tenantId, courseId);
  }

  /** HOD oversight is read-only; every editing method still checks direct teaching. */
  async getHodCourseWorkspace(hodUserId: string, tenantId: string, courseId: string) {
    await this.assertHodCourseScope(courseId, hodUserId, tenantId);
    return this.loadCourseWorkspace(tenantId, courseId);
  }

  private async loadCourseWorkspace(tenantId: string, courseId: string) {
    const course = await this.getCourseOrFail(courseId, tenantId);
    const moduleRows = await this.modules.find({
      where: { tenant_id: tenantId, course_id: courseId },
      order: { module_number: 'ASC' },
    });
    const materials = await this.materials.find({
      where: { tenant_id: tenantId, course_id: courseId },
      order: { uploaded_at: 'DESC' },
    });
    const visibilityByMaterial = await this.loadVisibilityByMaterial(
      materials.map((m) => m.material_id),
    );
    return {
      course,
      syllabus_materials: this.mapMaterials(
        materials.filter((m) => m.material_type === 'SYLLABUS'),
        visibilityByMaterial,
      ),
      modules: moduleRows.map((m) =>
        this.mapModule(m, materials, visibilityByMaterial),
      ),
      syllabus_configured: moduleRows.length > 0,
    };
  }

  async getMaterialPublishTargets(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
  ) {
    await this.assertFacultyTeaches(courseId, facultyUserId, tenantId);
    const course = await this.getCourseOrFail(courseId, tenantId);
    const rows = await this.dataSource.query<
      Array<{
        allocation_id: string;
        program_name: string | null;
        semester: string | null;
        subject_code: string;
        subject_name: string;
      }>
    >(
      `SELECT a.allocation_id, a.program_name, a.semester, s.subject_code, s.subject_name
       FROM academic_course_allocations a
       JOIN academic_subjects s ON s.subject_id = a.subject_id
       WHERE a.tenant_id = $1
         AND a.course_id = $3
         AND a.status = 'ACTIVE'
           AND a.faculty_user_id = $2
       ORDER BY a.program_name NULLS LAST, a.semester NULLS LAST`,
      [tenantId, facultyUserId, courseId],
    );

    return {
      course: {
        course_id: course.course_id,
        course_code: course.course_code,
        course_name: course.course_name,
      },
      targets: rows.map((row) => ({
        allocation_id: row.allocation_id,
        label: this.formatAllocationLabel(
          row.program_name,
          row.semester,
          row.subject_name,
        ),
        program_name: row.program_name,
        semester: row.semester,
        subject_code: row.subject_code,
        subject_name: row.subject_name,
      })),
      cross_section_available: rows.length > 1,
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

    await this.dataSource.transaction(async (manager) => {
      // Lock the parent before checking references so a concurrent upload cannot
      // acquire its course foreign-key reference between the check and deletion.
      const course = await manager.getRepository(AcademicCourse).findOne({
        where: { tenant_id: tenantId, course_id: courseId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!course) throw new NotFoundException('Course not found');
      const materialCount = await manager.getRepository(CourseMaterial).count({
        where: {
          tenant_id: tenantId,
          course_id: courseId,
          module_id: Not(IsNull()),
        },
        withDeleted: true,
      });
      if (materialCount > 0) {
        throw new BadRequestException(
          'This syllabus has current or archived materials. Update its existing units instead of replacing the syllabus to preserve recovery information.',
        );
      }
      const modules = manager.getRepository(CourseModule);
      await modules.delete({ tenant_id: tenantId, course_id: courseId });
      const rows = items.map((item) =>
        modules.create({
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
      await modules.save(rows);
    });
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
    dto: {
      title?: string;
      material_type?: string;
      allocation_ids?: string | string[];
    },
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

    const allocationIds = this.parseAllocationIds(dto.allocation_ids);
    await this.attachMaterialVisibility(
      material.material_id,
      allocationIds,
      facultyUserId,
      tenantId,
      mod.course_id,
    );

    mod.status = 'COMPLETED';
    mod.completed_at = new Date();
    mod.actual_completion_date = new Date().toISOString().slice(0, 10);
    await this.modules.save(mod);

    const course = await this.getCourseOrFail(mod.course_id, tenantId);
    await this.notifyStudentsForMaterialBestEffort(
      tenantId,
      mod.course_id,
      course.course_name,
      material.title,
      material.material_id,
      allocationIds,
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

  async deleteModule(
    facultyUserId: string,
    tenantId: string,
    moduleId: string,
  ) {
    const mod = await this.getModuleForFaculty(
      moduleId,
      facultyUserId,
      tenantId,
    );
    await this.dataSource.transaction(async (manager) => {
      const modules = manager.getRepository(CourseModule);
      const locked = await modules.findOne({
        where: { tenant_id: tenantId, module_id: mod.module_id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException('Module not found');
      const materialCount = await manager.getRepository(CourseMaterial).count({
        where: { tenant_id: tenantId, module_id: moduleId },
        withDeleted: true,
      });
      if (materialCount > 0) {
        throw new BadRequestException(
          'This unit has current or archived materials and must be retained to preserve recovery information.',
        );
      }
      await modules.remove(locked);
    });
    return { deleted: true, module_id: moduleId };
  }

  async uploadModuleMaterial(
    facultyUserId: string,
    tenantId: string,
    moduleId: string,
    file: Express.Multer.File,
    dto: {
      title?: string;
      material_type?: string;
      allocation_ids?: string | string[];
    },
  ) {
    const mod = await this.getModuleForFaculty(
      moduleId,
      facultyUserId,
      tenantId,
    );
    if (!file) throw new BadRequestException('File is required');

    const course = await this.getCourseOrFail(mod.course_id, tenantId);
    const materialType = (dto.material_type ?? 'NOTES').toUpperCase();
    const allocationIds = this.parseAllocationIds(dto.allocation_ids);
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

    await this.attachMaterialVisibility(
      material.material_id,
      allocationIds,
      facultyUserId,
      tenantId,
      mod.course_id,
    );

    await this.notifyStudentsForMaterialBestEffort(
      tenantId,
      mod.course_id,
      course.course_name,
      material.title,
      material.material_id,
      allocationIds,
    );

    return { module: mod, material };
  }

  async uploadModuleMaterials(
    facultyUserId: string,
    tenantId: string,
    moduleId: string,
    files: Express.Multer.File[],
    dto: {
      title?: string;
      material_type?: string;
      allocation_ids?: string | string[];
    },
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
    const allocationIds = this.parseAllocationIds(dto.allocation_ids);
    // Validate section scope before writing any file or material row. A rejected
    // publish must not leave a material behind that looks successfully uploaded.
    const validIds = await this.resolveMaterialAllocationIds(
      allocationIds, facultyUserId, tenantId, mod.course_id, true,
    );
    const storedFiles: Array<{ filePath: string; fileKey: string | null }> = [];
    let materials: CourseMaterial[];
    try {
      for (const file of files) storedFiles.push(await this.persistFile(tenantId, file));
      // All material and visibility rows commit together. A section mapping
      // failure can no longer leave a visible file paired with an HTTP 500.
      materials = await this.dataSource.transaction(async (manager) => {
        const saved: CourseMaterial[] = [];
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          const stored = storedFiles[index];
          const material = await manager.save(CourseMaterial, this.materials.create({
            tenant_id: tenantId,
            course_id: mod.course_id,
            faculty_user_id: facultyUserId,
            module_id: mod.module_id,
            title: files.length === 1 && dto.title?.trim()
              ? dto.title.trim()
              : file.originalname.replace(/\.[^.]+$/, ''),
            file_path: stored.filePath,
            file_key: stored.fileKey,
            material_type: materialType,
          }));
          if (validIds.length) {
            await manager.query(
              `INSERT INTO course_material_visibility (material_id, allocation_id)
               SELECT $1::uuid, unnest($2::uuid[])`,
              [material.material_id, validIds],
            );
          }
          saved.push(material);
        }
        return saved;
      });

    } catch (error) {
      for (const stored of storedFiles) {
        await this.removeStoredFile({
          file_path: stored.filePath,
          file_key: stored.fileKey,
        } as CourseMaterial).catch(() => undefined);
      }
      throw error;
    }
    await Promise.all(materials.map((material) =>
      this.notifyStudentsForMaterialBestEffort(
        tenantId, mod.course_id, course.course_name,
        material.title, material.material_id, validIds,
      ),
    ));
    return { module: mod, materials };
  }

  async addYouTubeMaterial(
    facultyUserId: string,
    tenantId: string,
    moduleId: string,
    dto: { title?: string; url?: string; allocation_ids?: string | string[] },
  ) {
    const mod = await this.getModuleForFaculty(moduleId, facultyUserId, tenantId);
    const title = dto.title?.trim();
    if (!title || title.length > 255) {
      throw new BadRequestException('Video title is required (maximum 255 characters)');
    }
    const externalUrl = normalizeYouTubeMaterialUrl(dto.url ?? '');
    const allocationIds = this.parseAllocationIds(dto.allocation_ids);
    const validIds = await this.resolveMaterialAllocationIds(
      allocationIds, facultyUserId, tenantId, mod.course_id, true,
    );
    const course = await this.getCourseOrFail(mod.course_id, tenantId);
    const material = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(CourseMaterial, this.materials.create({
        tenant_id: tenantId,
        course_id: mod.course_id,
        faculty_user_id: facultyUserId,
        module_id: mod.module_id,
        title,
        file_path: '',
        file_key: null,
        external_url: externalUrl,
        material_type: 'YOUTUBE',
      }));
      if (validIds.length) {
        await manager.query(
          `INSERT INTO course_material_visibility (material_id, allocation_id)
           SELECT $1::uuid, unnest($2::uuid[])`,
          [saved.material_id, validIds],
        );
      }
      return saved;
    });
    await this.notifyStudentsForMaterialBestEffort(
      tenantId, mod.course_id, course.course_name,
      material.title, material.material_id, validIds,
    );
    return { module: mod, material };
  }

  async uploadCourseSyllabus(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    file: Express.Multer.File,
    dto: { title?: string; allocation_ids?: string | string[] },
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
    const allocationIds = this.parseAllocationIds(dto.allocation_ids);
    await this.attachMaterialVisibility(
      material.material_id,
      allocationIds,
      facultyUserId,
      tenantId,
      courseId,
    );
    await this.notifyStudentsForMaterialBestEffort(
      tenantId,
      courseId,
      course.course_name,
      material.title,
      material.material_id,
      allocationIds,
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
    const visibleMaterials = await this.filterMaterialsForStudent(
      tenantId,
      studentUserId,
      courseId,
      materials,
      enrollment,
    );

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
      modules: modules.map((m) => this.mapModule(m, visibleMaterials)),
      syllabus_materials: this.mapMaterials(
        visibleMaterials.filter((m) => m.material_type === 'SYLLABUS'),
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

    if (material.faculty_user_id !== facultyUserId) {
      throw new ForbiddenException('Only the uploading faculty may delete this material');
    }

    // Keep original bytes, metadata and visibility links for authorized recovery.
    // LMS repository reads and student downloads exclude the archived row.
    await this.materials.softRemove(material);
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

    const canAccess = await this.studentCanAccessMaterial(
      tenantId,
      studentUserId,
      material,
      enrolled,
    );
    if (!canAccess)
      throw new ForbiddenException(
        'This material is not published to your section',
      );

    return material;
  }

  async streamMaterialDownload(material: CourseMaterial) {
    if (material.external_url || !material.file_path) {
      throw new BadRequestException('This material is an external link, not a downloadable file');
    }
    const metadata = materialDownloadMetadata(material);
    if (material.file_key && this.objectStorage.isEnabled()) {
      const stream = await this.objectStorage.getDownloadStream(
        material.file_key,
      );
      return {
        stream,
        ...metadata,
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
      ...metadata,
    };
  }

  private mapModule(
    mod: CourseModule,
    materials: CourseMaterial[],
    visibilityByMaterial?: Map<string, string[]>,
  ) {
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
      materials: this.mapMaterials(linked, visibilityByMaterial),
    };
  }

  private mapMaterials(
    materials: CourseMaterial[],
    visibilityByMaterial?: Map<string, string[]>,
  ) {
    return materials.map((m) => ({
      material_id: m.material_id,
      title: m.title,
      material_type: m.material_type,
      external_url: m.external_url ?? null,
      uploaded_at: m.uploaded_at,
      published_sections: visibilityByMaterial?.get(m.material_id) ?? [],
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
    if (row) return;

    const allocation = await this.dataSource.query(
      `SELECT 1 FROM academic_course_allocations
       WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3 AND status = 'ACTIVE'
       LIMIT 1`,
      [tenantId, courseId, facultyUserId],
    );
    if (allocation.length) return;

    throw new NotFoundException('Course not found in your teaching timetable');
  }

  private async assertHodCourseScope(courseId: string, hodUserId: string, tenantId: string) {
    await this.getCourseOrFail(courseId, tenantId);
    const hodDepartmentIds = await this.resolveHodDepartmentIds(hodUserId, tenantId);
    if (hodDepartmentIds.length) {
      const scoped = await this.dataSource.query(
        `SELECT 1
         WHERE EXISTS (
           SELECT 1 FROM academic_course_allocations a
           JOIN users assigned ON assigned.user_id = a.faculty_user_id AND assigned.tenant_id = a.tenant_id
           WHERE a.tenant_id = $1 AND a.course_id = $2 AND a.status = 'ACTIVE'
             AND ${allocationDepartmentScope('a', 'assigned', '$3::int[]')}
         ) OR ${enrolledDepartmentScope('$2', '$1', '$3::int[]')}`,
        [tenantId, courseId, hodDepartmentIds],
      );
      if (scoped.length) return;
    }

    throw new NotFoundException('Course not found in your department');
  }

  async notifyHodCourseFaculty(
    hodUserId: string,
    tenantId: string,
    courseId: string,
    facultyUserId: string,
    message: string,
  ) {
    await this.assertHodCourseScope(courseId, hodUserId, tenantId);
    const body = message?.trim();
    if (!body || body.length > 1000) {
      throw new BadRequestException('Message must be between 1 and 1000 characters');
    }
    const rows = await this.dataSource.query<Array<{ name: string }>>(
      `SELECT u.name FROM academic_course_allocations a
       JOIN users u ON u.user_id = a.faculty_user_id AND u.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1 AND a.course_id = $2 AND a.faculty_user_id = $3
         AND a.status = 'ACTIVE' AND u.is_active = true AND u.deleted_at IS NULL
       LIMIT 1`,
      [tenantId, courseId, facultyUserId],
    );
    if (!rows.length) throw new NotFoundException('Active course faculty not found');
    const course = await this.getCourseOrFail(courseId, tenantId);
    await this.falconNotifications.create({
      tenantId,
      userId: facultyUserId,
      category: 'ACADEMICS',
      title: `HOD note · ${course.course_code}`,
      message: body,
      actionLink: `/faculty/courses/${encodeURIComponent(courseId)}`,
      intent: 'action_required',
      metadata: { course_id: courseId, hod_user_id: hodUserId },
    });
    return { sent: true, recipient: rows[0].name };
  }

  private async resolveHodDepartmentIds(hodUserId: string, tenantId: string): Promise<number[]> {
    const rows = await this.dataSource.query<Array<{ dept_id: number }>>(
      `SELECT d.dept_id FROM departments d
       JOIN users hod ON hod.user_id = d.hod_user_id AND hod.tenant_id = $2
       WHERE d.hod_user_id = $1 AND d.deleted_at IS NULL
       UNION
       SELECT u.dept_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1 AND u.tenant_id = $2 AND u.dept_id IS NOT NULL AND lower(r.role_name) = 'hod'`,
      [hodUserId, tenantId],
    );
    return [...new Set(rows.map((row) => Number(row.dept_id)).filter(Boolean))];
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
      },
    });
    if (!mod) throw new NotFoundException('Module not found');
    if (mod.faculty_user_id !== facultyUserId) {
      throw new ForbiddenException('Only the owning faculty may change this unit');
    }
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

  private parseAllocationIds(raw?: string | string[]): string[] {
    if (!raw) return [];
    let values: string[];
    if (Array.isArray(raw)) {
      values = raw;
    } else if (!raw.trim()) {
      return [];
    } else if (raw.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === 'string')) {
          throw new Error('Invalid section list');
        }
        values = parsed;
      } catch {
        throw new BadRequestException('Invalid teaching section selection');
      }
    } else {
      values = raw.split(',');
    }
    const ids = values.map((v) => v.trim()).filter(Boolean);
    if (ids.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
      throw new BadRequestException('Invalid teaching section ID');
    }
    return [...new Set(ids)];
  }

  private formatAllocationLabel(
    programName: string | null,
    semester: string | null,
    subjectName: string,
  ) {
    const program = programName?.trim() || 'Program';
    const sem = semester?.trim() || 'Section';
    return `${program} (${sem}) — ${subjectName}`;
  }

  private parseAllocationSemester(semester: string | null): {
    semesterNum: number | null;
    sectionCode: string | null;
  } {
    if (!semester?.trim()) return { semesterNum: null, sectionCode: null };
    const parts = semester.trim().split('-');
    const roman = parts[0]?.trim().toUpperCase() ?? '';
    const sectionCode = parts[1]?.trim().toUpperCase() || null;
    return {
      semesterNum: this.romanToInt(roman),
      sectionCode,
    };
  }

  private romanToInt(value: string): number | null {
    const map: Record<string, number> = {
      I: 1,
      II: 2,
      III: 3,
      IV: 4,
      V: 5,
      VI: 6,
      VII: 7,
      VIII: 8,
    };
    return map[value] ?? null;
  }

  private normalizeProgram(value: string | null | undefined) {
    return (value ?? '').replace(/\s+/g, '').toUpperCase();
  }

  private async resolveMaterialAllocationIds(
    allocationIds: string[],
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    requireSelection = false,
  ): Promise<string[]> {
    if (!allocationIds.length) {
      if (requireSelection) {
        const available = await this.dataSource.query<Array<{ allocation_id: string }>>(
          `SELECT allocation_id FROM academic_course_allocations
           WHERE tenant_id = $1 AND course_id = $2 AND status = 'ACTIVE' LIMIT 1`,
          [tenantId, courseId],
        );
        if (available.length) {
          throw new BadRequestException('Select at least one teaching section for this material');
        }
      }
      return [];
    }

    const validIds = await this.dataSource.query<
      Array<{ allocation_id: string }>
    >(
      `SELECT a.allocation_id
       FROM academic_course_allocations a
       WHERE a.tenant_id = $1
         AND a.course_id = $2
         AND a.allocation_id = ANY($3::uuid[])
         AND a.status = 'ACTIVE'
         AND a.faculty_user_id = $4`,
      [tenantId, courseId, allocationIds, facultyUserId],
    );
    const valid = validIds.map((row) => row.allocation_id);
    if (valid.length !== new Set(allocationIds).size) {
      throw new BadRequestException(
        'One or more teaching sections are not available for publish',
      );
    }
    return valid;
  }

  private async attachMaterialVisibility(
    materialId: string,
    allocationIds: string[],
    facultyUserId: string,
    tenantId: string,
    courseId: string,
  ) {
    const valid = await this.resolveMaterialAllocationIds(
      allocationIds, facultyUserId, tenantId, courseId,
    );
    if (!valid.length) return;
    // CourseAllocation's inherited deleted_at is absent on older databases.
    // Insert validated IDs directly instead of loading that entity, which
    // previously failed after the material had already been saved (HTTP 500).
    await this.dataSource.query(
      `INSERT INTO course_material_visibility (material_id, allocation_id)
       SELECT $1::uuid, unnest($2::uuid[])
       ON CONFLICT (material_id, allocation_id) DO NOTHING`,
      [materialId, valid],
    );
  }

  private async loadVisibilityByMaterial(materialIds: string[]) {
    const map = new Map<string, string[]>();
    if (!materialIds.length) return map;

    const rows = await this.dataSource.query<
      Array<{ material_id: string; label: string }>
    >(
      `SELECT v.material_id,
              COALESCE(a.program_name, 'Program') || ' (' || COALESCE(a.semester, 'Section') || ')' AS label
       FROM course_material_visibility v
       JOIN academic_course_allocations a ON a.allocation_id = v.allocation_id
       WHERE v.material_id = ANY($1::uuid[])
       ORDER BY a.program_name, a.semester`,
      [materialIds],
    );

    for (const row of rows) {
      const existing = map.get(row.material_id) ?? [];
      existing.push(row.label);
      map.set(row.material_id, existing);
    }
    return map;
  }

  private async filterMaterialsForStudent(
    tenantId: string,
    studentUserId: string,
    courseId: string,
    materials: CourseMaterial[],
    enrollment: StudentCourseEnrollment,
  ) {
    if (!materials.length) return materials;

    const materialIds = materials.map((m) => m.material_id);
    const visibilityRows = await this.dataSource.query<
      Array<{ material_id: string; allocation_id: string }>
    >(
      `SELECT material_id, allocation_id
       FROM course_material_visibility
       WHERE material_id = ANY($1::uuid[])`,
      [materialIds],
    );

    const visibilityByMaterial = new Map<string, string[]>();
    for (const row of visibilityRows) {
      const list = visibilityByMaterial.get(row.material_id) ?? [];
      list.push(row.allocation_id);
      visibilityByMaterial.set(row.material_id, list);
    }

    const profileRows = await this.dataSource.query<
      Array<{ batch: string | null }>
    >(`SELECT batch FROM student_profiles WHERE user_id = $1 LIMIT 1`, [
      studentUserId,
    ]);
    const studentProgram = this.normalizeProgram(profileRows[0]?.batch);

    const allocationIds = [
      ...new Set(visibilityRows.map((row) => row.allocation_id)),
    ];
    const allocationRows = allocationIds.length
      ? await this.dataSource.query<Array<Pick<CourseAllocation, 'allocation_id' | 'semester' | 'program_name'>>>(
          `SELECT allocation_id, semester, program_name
           FROM academic_course_allocations
           WHERE tenant_id = $1 AND course_id = $2
             AND allocation_id = ANY($3::uuid[])`,
          [tenantId, courseId, allocationIds],
        )
      : [];

    const allocationMap = new Map(
      allocationRows.map((row) => [row.allocation_id, row]),
    );

    return materials.filter((material) => {
      const scopedIds = visibilityByMaterial.get(material.material_id);
      if (!scopedIds?.length) return true;
      return scopedIds.some((allocationId) => {
        const allocation = allocationMap.get(allocationId);
        if (!allocation) return false;
        return this.enrollmentMatchesAllocation(
          enrollment,
          allocation,
          studentProgram,
        );
      });
    });
  }

  private async studentCanAccessMaterial(
    tenantId: string,
    studentUserId: string,
    material: CourseMaterial,
    enrollment: StudentCourseEnrollment,
  ) {
    const visible = await this.filterMaterialsForStudent(
      tenantId,
      studentUserId,
      material.course_id,
      [material],
      enrollment,
    );
    return visible.length > 0;
  }

  private enrollmentMatchesAllocation(
    enrollment: StudentCourseEnrollment,
    allocation: Pick<CourseAllocation, 'semester' | 'program_name'>,
    studentProgram: string,
  ) {
    const { semesterNum, sectionCode } = this.parseAllocationSemester(
      allocation.semester,
    );
    if (semesterNum != null && enrollment.semester !== semesterNum)
      return false;

    const allocationProgram = this.normalizeProgram(allocation.program_name);
    if (
      studentProgram &&
      allocationProgram &&
      studentProgram !== allocationProgram
    ) {
      return false;
    }

    const enrollmentSection =
      enrollment.section_code?.trim().toUpperCase() ?? null;
    if (sectionCode && enrollmentSection && enrollmentSection !== sectionCode) {
      return false;
    }

    return true;
  }

  private async notifyStudentsForMaterial(
    tenantId: string,
    courseId: string,
    courseName: string,
    materialTitle: string,
    materialId: string,
    allocationIds: string[],
  ) {
    if (!allocationIds.length) {
      await this.notifyEnrolledStudents(
        tenantId,
        courseId,
        courseName,
        materialTitle,
      );
      return;
    }

    const rows = await this.dataSource.query<
      Array<{ student_user_id: string }>
    >(
      `SELECT DISTINCT e.student_user_id
       FROM student_course_enrollments e
       LEFT JOIN student_profiles sp ON sp.user_id = e.student_user_id
       JOIN course_material_visibility v ON v.material_id = $4
       JOIN academic_course_allocations a ON a.allocation_id = v.allocation_id
       WHERE e.tenant_id = $1
         AND e.course_id = $2
         AND e.status = 'ENROLLED'
         AND v.allocation_id = ANY($3::uuid[])
         AND (
           a.semester IS NULL
           OR split_part(a.semester, '-', 1) = ''
           OR CASE upper(split_part(a.semester, '-', 1))
             WHEN 'I' THEN 1 WHEN 'II' THEN 2 WHEN 'III' THEN 3 WHEN 'IV' THEN 4
             WHEN 'V' THEN 5 WHEN 'VI' THEN 6 WHEN 'VII' THEN 7 WHEN 'VIII' THEN 8
             ELSE NULL END = e.semester
         )
         AND (
           sp.batch IS NULL OR a.program_name IS NULL
           OR upper(replace(sp.batch, ' ', '')) = upper(replace(a.program_name, ' ', ''))
         )
         AND (
           e.section_code IS NULL
           OR split_part(a.semester, '-', 2) = ''
           OR upper(e.section_code) = upper(split_part(a.semester, '-', 2))
         )`,
      [tenantId, courseId, allocationIds, materialId],
    );

    for (const row of rows) {
      this.notificationEmitter.courseMaterialAdded({
        tenantId,
        userId: row.student_user_id,
        courseId,
        courseName,
        materialTitle,
      });
    }
  }

  /**
   * Material persistence is the primary operation. A notification failure must
   * never turn a completed upload into a misleading 500 response for faculty.
   */
  private async notifyStudentsForMaterialBestEffort(
    tenantId: string,
    courseId: string,
    courseName: string,
    materialTitle: string,
    materialId: string,
    allocationIds: string[],
  ) {
    try {
      await this.notifyStudentsForMaterial(
        tenantId,
        courseId,
        courseName,
        materialTitle,
        materialId,
        allocationIds,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Material ${materialId} was uploaded, but student notifications could not be sent: ${message}`,
      );
    }
  }

  private async removeStoredFile(material: CourseMaterial) {
    if (!material.file_path) return;
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

  async listAnnouncements(
    tenantId: string,
    courseId: string,
    viewer: { userId: string; role: 'faculty' | 'student' },
  ) {
    if (viewer.role === 'faculty') {
      await this.assertFacultyTeaches(courseId, viewer.userId, tenantId);
    } else {
      const enrollment = await this.enrollments.findOne({
        where: {
          tenant_id: tenantId,
          course_id: courseId,
          student_user_id: viewer.userId,
          status: 'ENROLLED',
        },
      });
      if (!enrollment) {
        throw new ForbiddenException('You are not enrolled in this course');
      }
    }

    return this.dataSource.query(
      `SELECT a.announcement_id, a.course_id, a.faculty_user_id, a.title, a.body, a.created_at,
              u.name AS faculty_name
       FROM course_announcements a
       JOIN users u ON u.user_id = a.faculty_user_id
       WHERE a.tenant_id = $1 AND a.course_id = $2 AND a.deleted_at IS NULL
       ORDER BY a.created_at DESC`,
      [tenantId, courseId],
    );
  }

  async createAnnouncement(
    facultyUserId: string,
    tenantId: string,
    courseId: string,
    dto: { title?: string; body?: string },
  ) {
    await this.assertFacultyTeaches(courseId, facultyUserId, tenantId);
    const title = dto.title?.trim();
    const body = dto.body?.trim();
    if (!title || !body) {
      throw new BadRequestException('Title and body are required');
    }

    const rows = await this.dataSource.query(
      `INSERT INTO course_announcements (tenant_id, course_id, faculty_user_id, title, body)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING announcement_id, course_id, faculty_user_id, title, body, created_at`,
      [tenantId, courseId, facultyUserId, title, body],
    );
    const announcement = rows[0] as {
      announcement_id: string;
      title: string;
      body: string;
    };

    const course = await this.courses.findOne({
      where: { tenant_id: tenantId, course_id: courseId },
    });
    const enrolled = await this.enrollments.find({
      where: { tenant_id: tenantId, course_id: courseId, status: 'ENROLLED' },
      select: ['student_user_id'],
    });
    const preview =
      body.length > 240 ? `${body.slice(0, 237).trimEnd()}...` : body;

    for (const row of enrolled) {
      this.notificationEmitter.courseAnnouncement({
        tenantId,
        userId: row.student_user_id,
        courseId,
        courseName: course?.course_name ?? 'Course',
        courseCode: course?.course_code,
        announcementId: announcement.announcement_id,
        title: announcement.title,
        bodyPreview: preview,
      });
    }

    return { ...announcement, notified_count: enrolled.length };
  }

  async listQuestionBank(
    facultyUserId: string,
    tenantId: string,
    courseId?: string,
  ) {
    if (courseId) {
      await this.assertFacultyTeaches(courseId, facultyUserId, tenantId);
    }
    if (courseId) {
      return this.dataSource.query(
        `SELECT * FROM faculty_question_bank
         WHERE tenant_id = $1 AND faculty_user_id = $2 AND deleted_at IS NULL
           AND (course_id = $3 OR course_id IS NULL)
         ORDER BY created_at DESC`,
        [tenantId, facultyUserId, courseId],
      );
    }
    return this.dataSource.query(
      `SELECT * FROM faculty_question_bank
       WHERE tenant_id = $1 AND faculty_user_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [tenantId, facultyUserId],
    );
  }

  async createQuestionBankItem(
    facultyUserId: string,
    tenantId: string,
    dto: {
      course_id?: string;
      question_text?: string;
      option_a?: string;
      option_b?: string;
      option_c?: string;
      option_d?: string;
      correct_option?: string;
      tags?: string;
    },
  ) {
    if (dto.course_id) {
      await this.assertFacultyTeaches(dto.course_id, facultyUserId, tenantId);
    }
    const questionText = dto.question_text?.trim();
    const optionA = dto.option_a?.trim();
    const optionB = dto.option_b?.trim();
    const optionC = dto.option_c?.trim();
    const optionD = dto.option_d?.trim();
    const correct = (dto.correct_option ?? '').trim().toUpperCase();
    if (
      !questionText ||
      !optionA ||
      !optionB ||
      !optionC ||
      !optionD ||
      !['A', 'B', 'C', 'D'].includes(correct)
    ) {
      throw new BadRequestException(
        'Question, options A–D, and correct option (A–D) are required',
      );
    }

    const rows = await this.dataSource.query(
      `INSERT INTO faculty_question_bank (
         tenant_id, faculty_user_id, course_id, question_text,
         option_a, option_b, option_c, option_d, correct_option, tags
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        tenantId,
        facultyUserId,
        dto.course_id ?? null,
        questionText,
        optionA,
        optionB,
        optionC,
        optionD,
        correct,
        dto.tags?.trim() || null,
      ],
    );
    return rows[0];
  }

  async deleteQuestionBankItem(
    facultyUserId: string,
    tenantId: string,
    questionId: string,
  ) {
    const result = await this.dataSource.query(
      `UPDATE faculty_question_bank
       SET deleted_at = NOW()
       WHERE question_id = $1 AND tenant_id = $2 AND faculty_user_id = $3 AND deleted_at IS NULL
       RETURNING question_id`,
      [questionId, tenantId, facultyUserId],
    );
    if (!result.length) throw new NotFoundException('Question not found');
    return { deleted: true };
  }
}
