import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AcquisitionImportService } from './acquisition-import.service';
import { AcquisitionService } from './acquisition.service';
import type {
  AcquisitionActor,
  CreateAcquisitionInput,
} from './acquisition.types';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const ACQUISITION_WORKBOOK_MAX_BYTES = 5 * 1024 * 1024;

export function isAllowedAcquisitionWorkbook(
  file: Pick<Express.Multer.File, 'originalname' | 'mimetype'>,
) {
  return (
    file.originalname.toLowerCase().endsWith('.xlsx') &&
    file.mimetype === XLSX_MIME
  );
}

const workbookInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: ACQUISITION_WORKBOOK_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const valid = isAllowedAcquisitionWorkbook(file);
    callback(
      valid
        ? null
        : new BadRequestException('Only literal-value .xlsx files are allowed'),
      valid,
    );
  },
});

@Controller('api/acquisitions/v1')
@UseGuards(JwtAuthGuard)
export class AcquisitionController {
  constructor(
    private readonly acquisitions: AcquisitionService,
    private readonly imports: AcquisitionImportService,
  ) {}

  @Post()
  create(
    @Req() req: { user: AcquisitionActor; headers: Record<string, string> },
    @Body() body: CreateAcquisitionInput,
  ) {
    return this.acquisitions.createDraft(
      req.user,
      body,
      req.headers['x-request-id'],
    );
  }

  @Get()
  list(
    @Req() req: { user: AcquisitionActor },
    @Query('status') status?: string,
  ) {
    return this.acquisitions.list(req.user, status);
  }

  @Get('versions/:id')
  get(@Req() req: { user: AcquisitionActor }, @Param('id') id: string) {
    return this.acquisitions.getVersion(req.user, id);
  }

  @Get('versions/:id/audit')
  audit(@Req() req: { user: AcquisitionActor }, @Param('id') id: string) {
    return this.acquisitions.auditHistory(req.user, id);
  }

  @Get('versions/:id/compare/:otherId')
  compare(
    @Req() req: { user: AcquisitionActor },
    @Param('id') id: string,
    @Param('otherId') otherId: string,
  ) {
    return this.acquisitions.compareVersions(req.user, id, otherId);
  }

  @Put('versions/:id')
  replace(
    @Req() req: { user: AcquisitionActor },
    @Param('id') id: string,
    @Body() body: CreateAcquisitionInput,
  ) {
    return this.acquisitions.replaceDraft(req.user, id, body);
  }

  @Post('versions/:id/validate')
  validate(@Req() req: { user: AcquisitionActor }, @Param('id') id: string) {
    return this.acquisitions.validate(req.user, id);
  }

  @Post('versions/:id/submit')
  submit(@Req() req: { user: AcquisitionActor }, @Param('id') id: string) {
    return this.acquisitions.submit(req.user, id);
  }

  @Post('versions/:id/recommendations')
  recommendations(
    @Req() req: { user: AcquisitionActor },
    @Param('id') id: string,
  ) {
    return this.acquisitions.runRecommendations(req.user, id);
  }

  @Post('versions/:id/vendor-selection')
  selectVendors(
    @Req() req: { user: AcquisitionActor },
    @Param('id') id: string,
    @Body()
    body: {
      selections: Array<{
        line_id: string;
        vendor_id: string;
        deviation_justification?: string;
      }>;
    },
  ) {
    return this.acquisitions.selectVendors(req.user, id, body.selections ?? []);
  }

  @Post('versions/:id/withdraw')
  withdraw(@Req() req: { user: AcquisitionActor }, @Param('id') id: string) {
    return this.acquisitions.withdraw(req.user, id);
  }

  @Post('versions/:id/amend')
  amend(@Req() req: { user: AcquisitionActor }, @Param('id') id: string) {
    return this.acquisitions.amend(req.user, id);
  }

  @Get('imports/template')
  @Header('Content-Type', XLSX_MIME)
  async template(@Res() response: Response) {
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="falcon-acquisition-template-v1.xlsx"',
    );
    response.send(await this.imports.template());
  }

  @Post('imports/preview')
  @UseInterceptors(workbookInterceptor)
  preview(
    @Req() req: { user: AcquisitionActor },
    @UploadedFile() file: Express.Multer.File,
    @Body('header') headerJson: string,
  ) {
    let header: Omit<CreateAcquisitionInput, 'lines'>;
    try {
      header = JSON.parse(headerJson) as Omit<CreateAcquisitionInput, 'lines'>;
    } catch {
      throw new BadRequestException('header must be valid JSON');
    }
    return this.imports.preview(req.user, file, header);
  }

  @Post('imports/:id/commit')
  commit(@Req() req: { user: AcquisitionActor }, @Param('id') id: string) {
    return this.imports.commit(req.user, id);
  }
}
