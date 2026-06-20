import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AlumniPortalService } from './alumni-portal.service';
import { AlumniConversionService } from './alumni-conversion.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/alumni')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AlumniController {
  constructor(
    private readonly portal: AlumniPortalService,
    private readonly conversion: AlumniConversionService,
  ) {}

  @Get('me/profile')
  @Roles('Alumni', 'Student')
  myProfile(@Req() req: { user: AuthUser }) {
    return this.portal.getMyProfile(this.tenant(req), req.user.user_id);
  }

  @Patch('me/profile')
  @Roles('Alumni')
  updateProfile(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      current_organization?: string;
      designation?: string;
      linkedin_url?: string;
      higher_education_details?: Record<string, unknown>;
      opt_in_mentorship?: boolean;
    },
  ) {
    return this.portal.updateMyProfile(this.tenant(req), req.user.user_id, dto);
  }

  @Get('directory')
  @Roles('Alumni')
  directory(
    @Req() req: { user: AuthUser },
    @Query('batch_year') batchYear?: string,
    @Query('organization') organization?: string,
    @Query('q') q?: string,
  ) {
    return this.portal.directory(this.tenant(req), {
      batch_year: batchYear ? Number(batchYear) : undefined,
      organization,
      q,
    });
  }

  @Get('donations/funds')
  @Roles('Alumni')
  donationFunds() {
    return this.portal.listDonationFunds();
  }

  @Get('donations/mine')
  @Roles('Alumni')
  myDonations(@Req() req: { user: AuthUser }) {
    return this.portal.listMyDonations(this.tenant(req), req.user.user_id);
  }

  @Post('donations/initiate')
  @Roles('Alumni')
  initiateDonation(
    @Req() req: { user: AuthUser },
    @Body() dto: { amount: number; purpose?: string; fund_code?: string },
  ) {
    return this.portal.initiateDonation(
      this.tenant(req),
      req.user.user_id,
      dto,
    );
  }

  @Post('donations/:id/confirm-mock')
  @Roles('Alumni')
  confirmDonation(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.portal.confirmDonationMock(
      this.tenant(req),
      req.user.user_id,
      id,
    );
  }

  @Get('donations/:id/receipt')
  @Roles('Alumni')
  receipt(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.portal.getDonationReceipt(
      this.tenant(req),
      req.user.user_id,
      id,
    );
  }

  @Get('events')
  @Roles('Alumni')
  events(@Req() req: { user: AuthUser }) {
    return this.portal.listEvents(this.tenant(req), req.user.user_id);
  }

  @Post('events/:eventId/rsvp')
  @Roles('Alumni')
  rsvp(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    return this.portal.rsvpEvent(this.tenant(req), req.user.user_id, eventId);
  }

  @Get('services')
  @Roles('Alumni')
  services(@Req() req: { user: AuthUser }) {
    return this.portal.listServiceRequests(req.user.user_id);
  }

  @Post('services')
  @Roles('Alumni')
  createService(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      service_type: string;
      remarks?: string;
      dispatch_details?: Record<string, unknown>;
    },
  ) {
    return this.portal.createServiceRequest(req.user.user_id, dto);
  }

  @Get('conversion-eligibility')
  @Roles('Student')
  conversionEligibility(@Req() req: { user: AuthUser }) {
    return this.conversion.getConversionEligibility(
      this.tenant(req),
      req.user.user_id,
    );
  }

  @Post('register')
  @Roles('Student')
  registerFromExit(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      linkedin_url: string;
      placement_organization?: string;
      organization?: string;
      higher_education_details?: Record<string, unknown>;
      higher_ed?: string;
      personal_email?: string;
    },
  ) {
    const higherEd =
      dto.higher_education_details ??
      (dto.higher_ed?.trim() ? { pursuing: dto.higher_ed.trim() } : undefined);

    return this.conversion.submitConversionRequest(
      this.tenant(req),
      req.user.user_id,
      {
        linkedin_url: dto.linkedin_url,
        organization: dto.placement_organization ?? dto.organization,
        higher_education_details: higherEd,
        personal_email: dto.personal_email,
      },
    );
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? '';
  }
}
