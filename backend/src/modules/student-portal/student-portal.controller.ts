import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  ForbiddenException,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { StudentPortalService } from './student-portal.service';
import { OfficialTranscriptService } from '../exam-cell/official-transcript.service';
import {
  AcademicCalendarQueryDto,
  AcknowledgePolicyDto,
  AlumniRegisterDto,
  ConfirmStudentPaymentDto,
  CreateStudentPayOrderDto,
  LogExtracurricularDto,
  ProfileUpdateRequestDto,
  UpdateStudentProfileDto,
  UploadAdmissionDocumentDto,
} from './dto/student-portal.dto';

type AuthUser = { user_id: string; tenant_id?: string; roles?: string[] };

@Controller('api/student')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Student', 'Applicant')
export class StudentPortalController {
  constructor(
    private readonly portal: StudentPortalService,
    private readonly officialTranscripts: OfficialTranscriptService,
  ) {}

  @Get('dashboard')
  async dashboard(@Req() req: { user: AuthUser }) {
    const tenantId = this.tenant(req);
    const userId = req.user.user_id;
    const [profile, attendance, marks, registration] = await Promise.all([
      this.portal.getMasterProfile(tenantId, userId),
      this.portal.getAttendance(tenantId, userId),
      this.portal.getMarks(tenantId, userId),
      this.portal.getRegistration(tenantId, userId),
    ]);
    return { profile, attendance, marks, registration };
  }

  /** Alias used by some clients — same payload as marks / results desk */
  @Get('results')
  results(@Req() req: { user: AuthUser }) {
    return this.portal.getMarks(this.tenant(req), req.user.user_id);
  }

  @Get('profile')
  profile(@Req() req: { user: AuthUser }) {
    return this.portal.getMasterProfile(this.tenant(req), req.user.user_id);
  }

  @Patch('profile')
  updateProfile(
    @Req() req: { user: AuthUser },
    @Body() body: UpdateStudentProfileDto,
  ) {
    return this.portal.updateProfile(this.tenant(req), req.user.user_id, body);
  }

  @Get('profile/photo')
  async getProfilePhoto(@Req() req: { user: AuthUser }, @Res() res: Response) {
    const { stream, filePath } = await this.portal.openProfilePhotoStream(
      this.tenant(req),
      req.user.user_id,
    );
    const ext = filePath.split('.').pop()?.toLowerCase();
    const contentType =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    stream.pipe(res);
  }

  @Post('profile/photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadProfilePhoto(
    @Req() req: { user: AuthUser },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No photo uploaded');
    }
    return this.portal.uploadProfilePhoto(
      this.tenant(req),
      req.user.user_id,
      file,
    );
  }

  @Get('campus-settings')
  campusSettings(@Req() req: { user: AuthUser }) {
    return this.portal.getCampusSettings(this.tenant(req));
  }

  @Get('documents')
  documents(@Req() req: { user: AuthUser }) {
    return this.portal.getDocumentVault(this.tenant(req), req.user.user_id);
  }

  @Get('admission-vault')
  admissionVault(@Req() req: { user: AuthUser }) {
    return this.portal.getAdmissionVault(this.tenant(req), req.user.user_id);
  }

  @Post('admission-documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadAdmissionDocument(
    @Req() req: { user: AuthUser },
    @Body() body: UploadAdmissionDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.portal.uploadAdmissionDocument(
      this.tenant(req),
      req.user.user_id,
      {
        title: body.title ?? '',
        issuer: body.issuer,
      },
      file,
    );
  }

  @Get('registration')
  registration(@Req() req: { user: AuthUser }) {
    return this.portal.getRegistration(this.tenant(req), req.user.user_id);
  }

  @Get('attendance')
  attendance(@Req() req: { user: AuthUser }) {
    return this.portal.getAttendance(this.tenant(req), req.user.user_id);
  }

  /** Read-only academic calendar for students (view / search / filter / export). */
  @Get('academic-calendar')
  academicCalendar(
    @Req() req: { user: AuthUser },
    @Query() query: AcademicCalendarQueryDto,
  ) {
    return this.portal.getAcademicCalendar(
      this.tenant(req),
      req.user.user_id,
      query.from,
      query.to,
    );
  }

  @Get('marks')
  marks(@Req() req: { user: AuthUser }) {
    return this.portal.getMarks(this.tenant(req), req.user.user_id);
  }

  @Get('transcripts')
  transcripts(@Req() req: { user: AuthUser }) {
    return this.officialTranscripts.listForStudent(
      this.tenant(req),
      req.user.user_id,
    );
  }

  @Get('exam-desk')
  examDesk(@Req() req: { user: AuthUser }) {
    return this.portal.getExamDesk(this.tenant(req), req.user.user_id);
  }

  @Get('extracurriculars')
  extracurriculars(@Req() req: { user: AuthUser }) {
    return this.portal.getExtracurriculars(this.tenant(req), req.user.user_id);
  }

  @Post('extracurriculars')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  logExtracurricular(
    @Req() req: { user: AuthUser },
    @Body() body: LogExtracurricularDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.portal.logExtracurricular(
      this.tenant(req),
      req.user.user_id,
      {
        activity_type: body.activity_type ?? 'OTHER',
        description: body.description ?? '',
        event_date: body.event_date ?? '',
      },
      file,
    );
  }

  @Get('discipline')
  discipline(@Req() req: { user: AuthUser }) {
    return this.portal.getDiscipline(this.tenant(req), req.user.user_id);
  }

  @Get('mentorship/alumni')
  alumniMentors(@Req() req: { user: AuthUser }) {
    return this.portal.listAlumniMentors(this.tenant(req));
  }

  @Get('exit')
  exit(@Req() req: { user: AuthUser }) {
    return this.portal.getExit(this.tenant(req), req.user.user_id);
  }

  @Get('library')
  library(@Req() req: { user: AuthUser }) {
    return this.portal.getLibrary(this.tenant(req), req.user.user_id);
  }

  @Get('transport')
  transport(@Req() req: { user: AuthUser }) {
    return this.portal.getTransport(this.tenant(req), req.user.user_id);
  }

  @Get('finance')
  finance(@Req() req: { user: AuthUser }) {
    return this.portal.getFinanceLedger(req.user.user_id, this.tenant(req));
  }

  @Post('finance/pay/order')
  @Roles('Student')
  createPayOrder(
    @Req() req: { user: AuthUser },
    @Body() body: CreateStudentPayOrderDto,
  ) {
    return this.portal.createPaymentOrder(
      req.user.user_id,
      body.demand_id,
      this.tenant(req),
    );
  }

  @Post('finance/pay')
  @Roles('Student')
  payFee(
    @Req() req: { user: AuthUser },
    @Body() body: ConfirmStudentPaymentDto,
  ) {
    return this.portal.confirmVerifiedPayment(
      req.user.user_id,
      this.tenant(req),
      {
        demand_id: body.demand_id,
        payment_id: body.payment_id,
        order_id: body.order_id,
        signature: body.signature,
      },
    );
  }

  @Get('placements')
  placements(@Req() req: { user: AuthUser }) {
    return this.portal.getPlacements(this.tenant(req), req.user.user_id);
  }

  @Post('profile/update-request')
  profileUpdateRequest(
    @Req() req: { user: AuthUser },
    @Body() body: ProfileUpdateRequestDto,
  ) {
    return this.portal.requestProfileUpdate(
      this.tenant(req),
      req.user.user_id,
      {
        subject: body.subject ?? 'Profile update request',
        description: body.description ?? '',
        fields_requested: body.fields_requested,
      },
    );
  }

  @Post('exit/alumni-register')
  alumniRegister(
    @Req() req: { user: AuthUser },
    @Body() body: AlumniRegisterDto,
  ) {
    return this.portal.registerAlumni(this.tenant(req), req.user.user_id, body);
  }

  @Get('policies')
  getPolicies(@Req() req: { user: AuthUser }) {
    return this.portal.getPolicies(this.tenant(req), req.user.user_id);
  }

  @Post('policies/:id/acknowledge')
  acknowledgePolicy(
    @Req() req: { user: AuthUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AcknowledgePolicyDto,
  ) {
    return this.portal.acknowledgePolicy(
      this.tenant(req),
      req.user.user_id,
      id,
      body.vote,
    );
  }

  private tenant(req: { user: AuthUser }) {
    const tenantId = req.user.tenant_id?.trim();
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }
    return tenantId;
  }
}
