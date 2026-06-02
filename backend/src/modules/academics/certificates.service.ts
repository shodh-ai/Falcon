import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, extname, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import {
  CertificateVerificationStatus,
  StudentCertificate,
} from '../../entities/student-certificate.entity';
import { AcademicMentorship } from '../../entities/academic-mentorship.entity';
import { User } from '../../entities/user.entity';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { WorkflowRoutingService } from '../../core/workflow/workflow-routing.service';
import { WorkflowNotificationService } from '../../core/workflow/workflow-notification.service';

const ALLOWED_CERTIFICATE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
];

export type UploadCertificateInput = {
  title?: string;
  issuer?: string;
  issue_date?: string;
};

export type VerifyCertificateInput = {
  status: CertificateVerificationStatus;
  points_awarded?: number;
  rejection_reason?: string;
};

export type CertificateDownload = {
  stream: Readable;
  filename: string;
  mimeType: string;
};

@Injectable()
export class CertificatesService {
  constructor(
    @InjectRepository(StudentCertificate)
    private readonly certificates: Repository<StudentCertificate>,
    @InjectRepository(AcademicMentorship)
    private readonly mentorships: Repository<AcademicMentorship>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly objectStorage: ObjectStorageService,
    private readonly workflowRouting: WorkflowRoutingService,
    private readonly workflowNotify: WorkflowNotificationService,
  ) {}

  async uploadCertificate(
    studentUserId: string,
    tenantId: string,
    dto: UploadCertificateInput,
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Certificate file is required');
    if (!ALLOWED_CERTIFICATE_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Only PDF, JPG, and PNG certificates are allowed');
    }
    if (!dto.title?.trim()) throw new BadRequestException('Title is required');
    if (!dto.issuer?.trim()) throw new BadRequestException('Issuer is required');

    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
    const stored = await this.persistFile(tenantId, uniqueName, file);

    const certificate = this.certificates.create({
      tenant_id: tenantId,
      student_user_id: studentUserId,
      title: dto.title.trim(),
      issuer: dto.issuer.trim(),
      issue_date: dto.issue_date || null,
      file_path: stored.filePath,
      file_key: stored.fileKey,
      original_filename: file.originalname,
      mime_type: file.mimetype,
      file_size: file.size,
      verification_status: 'PENDING',
      points_awarded: 0,
    });

    const saved = await this.certificates.save(certificate);

    const student = await this.users.findOne({ where: { user_id: studentUserId } });

    try {
      const approver = await this.workflowRouting.getStudentProctor(studentUserId);
      this.workflowNotify.notifyApprover({
        tenantId,
        approver,
        title: 'Certificate verification required',
        message: `${student?.name ?? 'Your mentee'} uploaded "${saved.title}" for verification.`,
        actionLink: '/faculty/mentorship',
        category: 'ACADEMICS',
        requesterName: student?.name,
      });
    } catch {
      /* no active proctor — student upload still succeeds */
    }

    return saved;
  }

  listMyCertificates(studentUserId: string, tenantId: string) {
    return this.certificates.find({
      where: { student_user_id: studentUserId, tenant_id: tenantId },
      order: { uploaded_at: 'DESC' },
    });
  }

  async listPendingForProctor(proctorUserId: string, tenantId: string) {
    const mentorships = await this.mentorships.find({
      where: { proctor_user_id: proctorUserId, is_active: true },
      relations: ['student'],
    });
    const studentIds = mentorships.map((m) => m.student_user_id);
    if (studentIds.length === 0) return [];

    const certificates = await this.certificates
      .createQueryBuilder('certificate')
      .leftJoinAndSelect('certificate.student', 'student')
      .where('certificate.tenant_id = :tenantId', { tenantId })
      .andWhere('certificate.verification_status = :status', { status: 'PENDING' })
      .andWhere('certificate.student_user_id IN (:...studentIds)', { studentIds })
      .orderBy('certificate.uploaded_at', 'DESC')
      .getMany();

    return certificates.map((certificate) => ({
      ...certificate,
      student: certificate.student
        ? {
            user_id: certificate.student.user_id,
            name: certificate.student.name,
            email: certificate.student.email,
          }
        : null,
    }));
  }

  async verifyCertificate(
    certificateId: string,
    proctorUserId: string,
    tenantId: string,
    dto: VerifyCertificateInput,
  ) {
    if (!['VERIFIED', 'REJECTED'].includes(dto.status)) {
      throw new BadRequestException('Status must be VERIFIED or REJECTED');
    }

    const certificate = await this.certificates.findOne({
      where: { certificate_id: certificateId, tenant_id: tenantId },
    });
    if (!certificate) throw new NotFoundException('Certificate not found');

    await this.assertProctorCanAccess(certificate.student_user_id, proctorUserId);

    certificate.verification_status = dto.status;
    certificate.points_awarded =
      dto.status === 'VERIFIED' ? Math.max(0, dto.points_awarded ?? 0) : 0;
    certificate.rejection_reason = dto.status === 'REJECTED'
      ? dto.rejection_reason ?? null
      : null;
    certificate.verified_by_user_id = proctorUserId;
    certificate.verified_at = new Date();

    return this.certificates.save(certificate);
  }

  async getDownload(
    certificateId: string,
    actorUserId: string,
    tenantId: string,
    actorRole?: string,
  ): Promise<CertificateDownload> {
    const certificate = await this.certificates.findOne({
      where: { certificate_id: certificateId, tenant_id: tenantId },
    });
    if (!certificate) throw new NotFoundException('Certificate not found');

    const canRead =
      certificate.student_user_id === actorUserId ||
      ['SuperAdmin', 'Registrar', 'HOD', 'Dean', 'IQAC'].includes(actorRole ?? '') ||
      (await this.isAssignedProctor(certificate.student_user_id, actorUserId));

    if (!canRead) throw new ForbiddenException('You cannot view this certificate');

    const filename = certificate.original_filename ?? basename(certificate.file_path);
    const mimeType = certificate.mime_type ?? 'application/octet-stream';

    if (certificate.file_key && this.objectStorage.isEnabled()) {
      return {
        stream: await this.objectStorage.getDownloadStream(certificate.file_key),
        filename,
        mimeType,
      };
    }

    const uploadRoot = resolve(process.env.UPLOAD_PATH || './uploads');
    const resolvedPath = resolve(certificate.file_path);
    if (!resolvedPath.startsWith(uploadRoot) || !existsSync(resolvedPath)) {
      throw new NotFoundException('Certificate file not found');
    }

    return {
      stream: createReadStream(resolvedPath),
      filename,
      mimeType,
    };
  }

  private async persistFile(
    tenantId: string,
    uniqueName: string,
    file: Express.Multer.File,
  ): Promise<{ filePath: string; fileKey: string | null }> {
    if (this.objectStorage.isEnabled()) {
      const key = this.objectStorage.buildKey(tenantId, uniqueName);
      const stored = await this.objectStorage.upload(
        tenantId,
        key,
        file.buffer,
        file.mimetype,
      );
      return { filePath: stored.url, fileKey: stored.key };
    }

    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const targetDir = `${uploadPath}/${tenantId}/certificates/${year}/${month}`;
    mkdirSync(targetDir, { recursive: true });
    const fullPath = `${targetDir}/${uniqueName}`;
    writeFileSync(fullPath, file.buffer);
    return { filePath: fullPath, fileKey: null };
  }

  private async assertProctorCanAccess(studentUserId: string, proctorUserId: string) {
    const canAccess = await this.isAssignedProctor(studentUserId, proctorUserId);
    if (!canAccess) {
      throw new ForbiddenException('Only the assigned mentor can verify this certificate');
    }
  }

  private async isAssignedProctor(studentUserId: string, proctorUserId: string) {
    const mentorship = await this.mentorships.findOne({
      where: {
        student_user_id: studentUserId,
        proctor_user_id: proctorUserId,
        is_active: true,
      },
    });
    return Boolean(mentorship);
  }
}
