import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ProctorService } from './proctor.service';
import { AssignMentorDto } from './dto/assign-mentor.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { BookProctorMeetingDto } from './dto/book-proctor-meeting.dto';
import { SendProctorMessageDto } from './dto/send-proctor-message.dto';

type AuthUser = { user_id: string; role?: string };

@Controller('api/academics/proctor')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProctorController {
  constructor(private readonly proctor: ProctorService) {}

  @Post('mentorships')
  @Roles('SuperAdmin', 'Registrar', 'HOD', 'Dean')
  assignMentor(@Body() dto: AssignMentorDto, @Req() req: { user: AuthUser }) {
    return this.proctor.assignMentor(dto, req.user.user_id);
  }

  @Get('me')
  @Roles('Student')
  getMyProctor(@Req() req: { user: AuthUser }) {
    return this.proctor.getAssignedProctor(req.user.user_id);
  }

  @Get('profile/me')
  @Roles('Student')
  getMyProfile(@Req() req: { user: AuthUser }) {
    return this.proctor.getStudentProfile(req.user.user_id);
  }

  @Patch('profile/me')
  @Roles('Student')
  updateMyProfile(@Req() req: { user: AuthUser }, @Body() dto: UpdateStudentProfileDto) {
    return this.proctor.updateStudentProfile(req.user.user_id, req.user.user_id, dto);
  }

  @Post('meetings')
  @Roles('Student')
  bookMeeting(@Req() req: { user: AuthUser }, @Body() dto: BookProctorMeetingDto) {
    return this.proctor.bookMeeting(req.user.user_id, dto.meeting_at, dto.note);
  }

  @Post('messages')
  @Roles('Student')
  sendMessage(@Req() req: { user: AuthUser }, @Body() dto: SendProctorMessageDto) {
    return this.proctor.sendMessage(req.user.user_id, dto.message);
  }


  @Get('my-students')
  @Roles('Faculty', 'SuperAdmin', 'Registrar', 'HOD', 'Dean')
  getMyStudents(@Req() req: { user: AuthUser }) {
    return this.proctor.getMyAssignedStudents(req.user.user_id);
  }

}