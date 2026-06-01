import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CertificatesService } from './certificates.service';
import type {
  UploadCertificateInput,
  VerifyCertificateInput,
} from './certificates.service';

type AuthUser = {
  user_id: string;
  role?: string;
  tenant_id?: string;
};

const certificateUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
};

@Controller('api/academics/certificates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Post('upload')
  @Roles('Student')
  @UseInterceptors(FileInterceptor('file', certificateUploadOptions))
  uploadCertificate(
    @Req() req: { user: AuthUser },
    @Body() dto: UploadCertificateInput,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.certificates.uploadCertificate(
      req.user.user_id,
      this.resolveTenantId(req.user),
      dto,
      file,
    );
  }

  @Get('my-certificates')
  @Roles('Student')
  myCertificates(@Req() req: { user: AuthUser }) {
    return this.certificates.listMyCertificates(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Get('pending-verification')
  @Roles('Faculty', 'SuperAdmin', 'Registrar', 'HOD', 'Dean', 'IQAC')
  pendingVerification(@Req() req: { user: AuthUser }) {
    return this.certificates.listPendingForProctor(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Patch(':certificateId/verify')
  @Roles('Faculty', 'SuperAdmin', 'Registrar', 'HOD', 'Dean', 'IQAC')
  verifyCertificate(
    @Param('certificateId') certificateId: string,
    @Req() req: { user: AuthUser },
    @Body() dto: VerifyCertificateInput,
  ) {
    return this.certificates.verifyCertificate(
      certificateId,
      req.user.user_id,
      this.resolveTenantId(req.user),
      dto,
    );
  }

  @Get(':certificateId/download')
  async downloadCertificate(
    @Param('certificateId') certificateId: string,
    @Req() req: { user: AuthUser },
    @Res() res: Response,
  ) {
    const file = await this.certificates.getDownload(
      certificateId,
      req.user.user_id,
      this.resolveTenantId(req.user),
      req.user.role,
    );
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
    return file.stream.pipe(res);
  }

  private resolveTenantId(user: AuthUser) {
    return user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
