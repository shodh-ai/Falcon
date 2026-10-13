import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { FacultyProfileService } from './faculty-profile.service';
import { HrFacultyPortfolioService, type FacultyWorkType } from '../hr/hr-faculty-portfolio.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/academics/faculty/profile')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('Faculty', 'HOD', 'Dean', 'SuperAdmin')
export class FacultyProfileController {
  constructor(
    private readonly profile: FacultyProfileService,
    private readonly portfolio: HrFacultyPortfolioService,
  ) {}

  private tenant(user: AuthUser) {
    return user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get()
  getProfile(@Req() req: { user: AuthUser }) {
    return this.profile.getProfile(this.tenant(req.user), req.user.user_id);
  }

  @Get('compliance')
  compliance(@Req() req: { user: AuthUser }) {
    return this.profile.getComplianceStatus(
      this.tenant(req.user),
      req.user.user_id,
    );
  }

  @Get('portfolio')
  getPortfolio(@Req() req: { user: AuthUser }) {
    return this.portfolio.list(this.tenant(req.user), req.user.user_id);
  }

  @Post('portfolio/skills')
  addPortfolioSkill(
    @Req() req: { user: AuthUser },
    @Headers('idempotency-key') key: string,
    @Body('keyword') keyword: string,
  ) {
    return this.portfolio.addSkill(this.tenant(req.user), req.user.user_id,
      req.user.user_id, keyword, key);
  }

  @Post('portfolio/skills/remove')
  removePortfolioSkill(
    @Req() req: { user: AuthUser },
    @Headers('idempotency-key') key: string,
    @Body('keyword') keyword: string,
  ) {
    return this.portfolio.removeSkill(this.tenant(req.user), req.user.user_id,
      req.user.user_id, keyword, key);
  }

  @Post('portfolio/work')
  addPortfolioWork(
    @Req() req: { user: AuthUser },
    @Headers('idempotency-key') key: string,
    @Body() body: { work_type: FacultyWorkType; title: string;
      description?: string; completed_on: string; evidence_url?: string },
  ) {
    return this.portfolio.addWork(this.tenant(req.user), req.user.user_id,
      req.user.user_id, body, key);
  }

  @Get('photo')
  async getPhoto(@Req() req: { user: AuthUser }, @Res() res: Response) {
    const { stream, filePath } = await this.profile.openProfilePhotoStream(
      this.tenant(req.user),
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

  @Post('photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadPhoto(
    @Req() req: { user: AuthUser },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No photo uploaded');
    }
    return this.profile.uploadProfilePhoto(
      this.tenant(req.user),
      req.user.user_id,
      file,
    );
  }

  @Patch()
  updateProfile(
    @Req() req: { user: AuthUser },
    @Body() body: Record<string, unknown>,
  ) {
    return this.profile.updateProfile(this.tenant(req.user), req.user.user_id, {
      phone: body.phone as string | null | undefined,
      emergency_contact_name: body.emergency_contact_name as string | undefined,
      emergency_contact_phone: body.emergency_contact_phone as
        | string
        | undefined,
      permanent_address: body.permanent_address as string | undefined,
      current_address: body.current_address as string | undefined,
      orcid_id: body.orcid_id as string | undefined,
      scopus_id: body.scopus_id as string | undefined,
      google_scholar_url: body.google_scholar_url as string | undefined,
      total_experience_years: body.total_experience_years as number | undefined,
      industry_experience_years: body.industry_experience_years as
        | number
        | undefined,
    });
  }

  @Post('kyc/reveal')
  revealKyc(
    @Req() req: { user: AuthUser },
    @Body('password') password: string,
  ) {
    return this.profile.revealKyc(
      this.tenant(req.user),
      req.user.user_id,
      password,
    );
  }

  @Post('bank-change-request')
  bankChangeRequest(
    @Req() req: { user: AuthUser },
    @Body()
    body: { bank_account_no: string; ifsc_code: string; bank_name?: string },
  ) {
    return this.profile.submitBankChangeRequest(
      this.tenant(req.user),
      req.user.user_id,
      body,
    );
  }

  @Get('qualifications')
  listQualifications(@Req() req: { user: AuthUser }) {
    return this.profile.listQualifications(
      this.tenant(req.user),
      req.user.user_id,
    );
  }

  @Post('qualifications')
  @UseInterceptors(
    FileInterceptor('document', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async addQualification(
    @Req() req: { user: AuthUser },
    @Body() body: Record<string, string>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const tenantId = this.tenant(req.user);
    const userId = req.user.user_id;
    let documentProofUrl = body.document_proof_url;
    if (file) {
      documentProofUrl = await this.profile.saveQualificationDocument(
        tenantId,
        userId,
        file,
      );
    }
    return this.profile.addQualification(tenantId, userId, {
      degree_level: body.degree_level,
      degree_name: body.degree_name,
      university: body.university,
      passing_year: Number(body.passing_year),
      specialization: body.specialization,
      document_proof_url: documentProofUrl,
    });
  }
}
