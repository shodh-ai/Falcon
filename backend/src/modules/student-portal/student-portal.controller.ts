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
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { StudentPortalService } from './student-portal.service';
import { OfficialTranscriptService } from '../exam-cell/official-transcript.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/student')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Student', 'Applicant')
export class StudentPortalController {
  constructor(
    private readonly portal: StudentPortalService,
    private readonly officialTranscripts: OfficialTranscriptService,
  ) {}

  @Get('profile')
  profile(@Req() req: { user: AuthUser }) {
    return this.portal.getMasterProfile(this.tenant(req), req.user.user_id);
  }

  @Patch('profile')
  updateProfile(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      profile_photo_url?: string;
      bank_details?: Record<string, any>;
      parent_details?: Record<string, any>;
      address?: { permanent?: string; current?: string };
    },
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

  @Get('registration')
  registration(@Req() req: { user: AuthUser }) {
    return this.portal.getRegistration(this.tenant(req), req.user.user_id);
  }

  @Get('attendance')
  attendance(@Req() req: { user: AuthUser }) {
    return this.portal.getAttendance(this.tenant(req), req.user.user_id);
  }

  @Post('portal-bootstrap')
  portalBootstrap(@Req() req: { user: AuthUser }) {
    return this.portal.bootstrapPortal(this.tenant(req), req.user.user_id);
  }

  @Get('marks')
  marks(@Req() req: { user: AuthUser }) {
    return this.portal.getMarks(this.tenant(req), req.user.user_id);
  }

  @Get('transcripts')
  transcripts(@Req() req: { user: AuthUser }) {
    return this.officialTranscripts.listForStudent(this.tenant(req), req.user.user_id);
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
    @Body()
    body: { activity_type?: string; description?: string; event_date?: string },
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
    return this.portal.getFinanceLedger(req.user.user_id);
  }

  @Post('finance/pay/order')
  createPayOrder(
    @Req() req: { user: AuthUser },
    @Body() body: { demand_id: string },
  ) {
    return this.portal.createPaymentOrder(req.user.user_id, body.demand_id);
  }

  @Post('finance/pay')
  payFee(
    @Req() req: { user: AuthUser },
    @Body() body: { demand_id: string; payment_id?: string },
  ) {
    return this.portal.payDemandMock(
      req.user.user_id,
      body.demand_id,
      body.payment_id,
    );
  }

  @Get('placements')
  placements(@Req() req: { user: AuthUser }) {
    return this.portal.getPlacements(this.tenant(req), req.user.user_id);
  }

  @Post('profile/update-request')
  profileUpdateRequest(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      subject?: string;
      description?: string;
      fields_requested?: string[];
    },
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
    @Body() body: { linkedin_url?: string; placement_organization?: string },
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
    @Param('id') id: string,
    @Body() body: { vote?: 'YES' | 'NO' },
  ) {
    return this.portal.acknowledgePolicy(
      this.tenant(req),
      req.user.user_id,
      id,
      body.vote,
    );
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
