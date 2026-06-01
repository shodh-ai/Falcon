import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ParentService } from './parent.service';

@Controller('api/parent')
export class ParentController {
  constructor(private readonly parent: ParentService) {}

  @Post('otp/request')
  requestOtp(@Body('mobile') mobile: string) {
    return this.parent.requestOtp(mobile);
  }

  @Get('overview')
  overview(@Query('mobile') mobile = '+919999000001') {
    return this.parent.getChildOverview(mobile);
  }

  @Get('attendance')
  attendanceForParent(@Query('mobile') mobile = '+919999000001') {
    return this.parent.getAttendanceForParent(mobile);
  }

  @Get('marks')
  marksForParent(@Query('mobile') mobile = '+919999000001') {
    return this.parent.getMarksForParent(mobile);
  }

  @Get('fees')
  feesForParent(@Query('mobile') mobile = '+919999000001') {
    return this.parent.getFeeDuesForParent(mobile);
  }

  @Get('discipline')
  disciplineForParent(@Query('mobile') mobile = '+919999000001') {
    return this.parent.getDisciplineForParent(mobile);
  }

  @Get('students/:studentUserId/attendance')
  attendance(@Param('studentUserId') studentUserId: string) {
    return this.parent.getAttendance(studentUserId);
  }

  @Get('students/:studentUserId/marks')
  marks(@Param('studentUserId') studentUserId: string) {
    return this.parent.getMarks(studentUserId);
  }

  @Get('students/:studentUserId/fees')
  fees(@Param('studentUserId') studentUserId: string) {
    return this.parent.getFeeDues(studentUserId);
  }

  @Get('students/:studentUserId/discipline')
  discipline(@Param('studentUserId') studentUserId: string) {
    return this.parent.getDiscipline(studentUserId);
  }
}
