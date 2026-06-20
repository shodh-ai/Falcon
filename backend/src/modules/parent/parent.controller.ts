import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/roles.decorator';
import { ReadOnlyPortal } from '../../common/decorators/read-only-portal.decorator';
import { ParentWriteAction } from '../../common/decorators/parent-write-action.decorator';
import { ReadOnlyPortalGuard } from '../../common/guards/read-only-portal.guard';
import { ParentService } from './parent.service';

type ParentUser = { parent_mobile?: string; auth_type?: string };

@Controller('api/parent')
@ReadOnlyPortal()
@UseGuards(ReadOnlyPortalGuard)
export class ParentController {
  constructor(private readonly parent: ParentService) {}

  @Public()
  @Post('otp/request')
  requestOtp(@Body('mobile') mobile: string) {
    return this.parent.requestOtp(mobile);
  }

  @Public()
  @Post('otp/verify')
  verifyOtp(@Body() dto: { mobile: string; otp: string }) {
    return this.parent.verifyOtp(dto.mobile, dto.otp);
  }

  @Get('overview')
  @UseGuards(JwtAuthGuard)
  overview(@Req() req: { user: ParentUser }, @Query('mobile') mobile?: string) {
    return this.parent.getChildOverview(
      this.parent.resolveMobile(req.user, mobile),
    );
  }

  @Get('feed')
  @UseGuards(JwtAuthGuard)
  feed(
    @Req() req: { user: ParentUser },
    @Query('studentUserId') studentUserId: string,
  ) {
    return this.parent.getLiveFeed(
      this.parent.resolveMobile(req.user),
      studentUserId,
    );
  }

  @Get('students/:studentUserId/feed')
  @UseGuards(JwtAuthGuard)
  feedByStudent(
    @Req() req: { user: ParentUser },
    @Param('studentUserId') studentUserId: string,
  ) {
    return this.parent.getLiveFeed(
      this.parent.resolveMobile(req.user),
      studentUserId,
    );
  }

  @Get('students/:studentUserId/academics')
  @UseGuards(JwtAuthGuard)
  academics(
    @Req() req: { user: ParentUser },
    @Param('studentUserId') studentUserId: string,
  ) {
    return this.parent.getAcademicsSummary(
      this.parent.resolveMobile(req.user),
      studentUserId,
    );
  }

  @Get('students/:studentUserId/proctor')
  @UseGuards(JwtAuthGuard)
  proctor(
    @Req() req: { user: ParentUser },
    @Param('studentUserId') studentUserId: string,
  ) {
    return this.parent.getProctorInfo(
      this.parent.resolveMobile(req.user),
      studentUserId,
    );
  }

  @Post('students/:studentUserId/proctor/meeting-request')
  @ParentWriteAction()
  @UseGuards(JwtAuthGuard)
  requestMeeting(
    @Req() req: { user: ParentUser },
    @Param('studentUserId') studentUserId: string,
    @Body() dto: { note?: string; preferred_date?: string },
  ) {
    return this.parent.requestProctorMeeting(
      this.parent.resolveMobile(req.user),
      studentUserId,
      dto.note,
      dto.preferred_date,
    );
  }

  @Get('students/:studentUserId/tracking')
  @UseGuards(JwtAuthGuard)
  tracking(
    @Req() req: { user: ParentUser },
    @Param('studentUserId') studentUserId: string,
  ) {
    return this.parent.getTracking(
      this.parent.resolveMobile(req.user),
      studentUserId,
    );
  }

  @Get('students/:studentUserId/fee-certificate')
  @UseGuards(JwtAuthGuard)
  feeCertificate(
    @Req() req: { user: ParentUser },
    @Param('studentUserId') studentUserId: string,
    @Query('financial_year') financialYear?: string,
  ) {
    return this.parent.generateFeeCertificate(
      this.parent.resolveMobile(req.user),
      studentUserId,
      financialYear,
    );
  }

  @Post('students/:studentUserId/payments/order')
  @ParentWriteAction()
  @UseGuards(JwtAuthGuard)
  paymentOrder(
    @Req() req: { user: ParentUser },
    @Param('studentUserId') studentUserId: string,
    @Body() dto: { demand_id: string },
  ) {
    return this.parent.createPaymentOrder(
      this.parent.resolveMobile(req.user),
      studentUserId,
      dto.demand_id,
    );
  }

  @Post('students/:studentUserId/payments/confirm')
  @ParentWriteAction()
  @UseGuards(JwtAuthGuard)
  paymentConfirm(
    @Req() req: { user: ParentUser },
    @Param('studentUserId') studentUserId: string,
    @Body() dto: { demand_id: string; payment_id?: string },
  ) {
    return this.parent.confirmPayment(
      this.parent.resolveMobile(req.user),
      studentUserId,
      dto.demand_id,
      dto.payment_id,
    );
  }

  @Get('attendance')
  @UseGuards(JwtAuthGuard)
  attendance(
    @Req() req: { user: ParentUser },
    @Query('mobile') mobile?: string,
    @Query('studentUserId') studentUserId?: string,
  ) {
    return this.parent.getAttendanceForParent(
      this.parent.resolveMobile(req.user, mobile),
      studentUserId,
    );
  }

  @Get('marks')
  @UseGuards(JwtAuthGuard)
  marks(
    @Req() req: { user: ParentUser },
    @Query('mobile') mobile?: string,
    @Query('studentUserId') studentUserId?: string,
  ) {
    return this.parent.getMarksForParent(
      this.parent.resolveMobile(req.user, mobile),
      studentUserId,
    );
  }

  @Get('fees')
  @UseGuards(JwtAuthGuard)
  fees(
    @Req() req: { user: ParentUser },
    @Query('mobile') mobile?: string,
    @Query('studentUserId') studentUserId?: string,
  ) {
    return this.parent.getFeeDuesForParent(
      this.parent.resolveMobile(req.user, mobile),
      studentUserId,
    );
  }

  @Get('discipline')
  @UseGuards(JwtAuthGuard)
  discipline(
    @Req() req: { user: ParentUser },
    @Query('mobile') mobile?: string,
    @Query('studentUserId') studentUserId?: string,
  ) {
    return this.parent.getDisciplineForParent(
      this.parent.resolveMobile(req.user, mobile),
      studentUserId,
    );
  }

  @Get('students/:studentUserId/attendance')
  @UseGuards(JwtAuthGuard)
  attendanceById(
    @Req() req: { user: ParentUser },
    @Param('studentUserId') studentUserId: string,
  ) {
    return this.parent.getAttendanceForParent(
      this.parent.resolveMobile(req.user),
      studentUserId,
    );
  }

  @Get('students/:studentUserId/marks')
  @UseGuards(JwtAuthGuard)
  marksById(
    @Req() req: { user: ParentUser },
    @Param('studentUserId') studentUserId: string,
  ) {
    return this.parent.getMarksForParent(
      this.parent.resolveMobile(req.user),
      studentUserId,
    );
  }

  @Get('students/:studentUserId/fees')
  @UseGuards(JwtAuthGuard)
  feesById(
    @Req() req: { user: ParentUser },
    @Param('studentUserId') studentUserId: string,
  ) {
    return this.parent.getFeeDuesForParent(
      this.parent.resolveMobile(req.user),
      studentUserId,
    );
  }
}
