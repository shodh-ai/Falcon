import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/roles.decorator';
import { ReadOnlyPortal } from '../../common/decorators/read-only-portal.decorator';
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
    return this.parent.getChildOverview(this.parent.resolveMobile(req.user, mobile));
  }

  @Get('attendance')
  @UseGuards(JwtAuthGuard)
  attendance(@Req() req: { user: ParentUser }, @Query('mobile') mobile?: string) {
    return this.parent.getAttendanceForParent(this.parent.resolveMobile(req.user, mobile));
  }

  @Get('marks')
  @UseGuards(JwtAuthGuard)
  marks(@Req() req: { user: ParentUser }, @Query('mobile') mobile?: string) {
    return this.parent.getMarksForParent(this.parent.resolveMobile(req.user, mobile));
  }

  @Get('fees')
  @UseGuards(JwtAuthGuard)
  fees(@Req() req: { user: ParentUser }, @Query('mobile') mobile?: string) {
    return this.parent.getFeeDuesForParent(this.parent.resolveMobile(req.user, mobile));
  }

  @Get('discipline')
  @UseGuards(JwtAuthGuard)
  discipline(@Req() req: { user: ParentUser }, @Query('mobile') mobile?: string) {
    return this.parent.getDisciplineForParent(this.parent.resolveMobile(req.user, mobile));
  }

  @Get('students/:studentUserId/attendance')
  @UseGuards(JwtAuthGuard)
  attendanceById(@Param('studentUserId') studentUserId: string) {
    return this.parent.getAttendance(studentUserId);
  }

  @Get('students/:studentUserId/marks')
  @UseGuards(JwtAuthGuard)
  marksById(@Param('studentUserId') studentUserId: string) {
    return this.parent.getMarks(studentUserId);
  }

  @Get('students/:studentUserId/fees')
  @UseGuards(JwtAuthGuard)
  feesById(@Param('studentUserId') studentUserId: string) {
    return this.parent.getFeeDues(studentUserId);
  }
}
