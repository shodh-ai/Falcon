import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ProctorService } from './proctor.service';
import { MentorshipChatService } from './mentorship-chat.service';
import { SendMentorshipChatDto } from './dto/send-mentorship-chat.dto';
import { AssignMentorDto } from './dto/assign-mentor.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { BookProctorMeetingDto } from './dto/book-proctor-meeting.dto';
import { SendProctorMessageDto } from './dto/send-proctor-message.dto';
import { RespondMentorshipMeetingDto } from './dto/respond-mentorship-meeting.dto';
import { SubmitMentorLeaveRequestDto } from './dto/submit-mentor-leave-request.dto';
import { RespondMentorLeaveRequestDto } from './dto/respond-mentor-leave-request.dto';

type AuthUser = { user_id: string; role?: string; tenant_id?: string };

@Controller('api/academics/proctor')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProctorController {
  constructor(
    private readonly proctor: ProctorService,
    private readonly chat: MentorshipChatService,
  ) {}

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
  updateMyProfile(
    @Req() req: { user: AuthUser },
    @Body() dto: UpdateStudentProfileDto,
  ) {
    return this.proctor.updateStudentProfile(
      req.user.user_id,
      req.user.user_id,
      dto,
    );
  }

  @Post('meetings')
  @Roles('Student')
  bookMeeting(
    @Req() req: { user: AuthUser },
    @Body() dto: BookProctorMeetingDto,
  ) {
    return this.proctor.bookMeeting(req.user.user_id, dto.meeting_at, dto.note);
  }

  @Get('meetings/my')
  @Roles('Student')
  myMeetings(@Req() req: { user: AuthUser }) {
    return this.proctor.listStudentMeetings(req.user.user_id);
  }

  @Get('meetings/pending')
  @Roles('Faculty', 'SuperAdmin', 'Registrar', 'HOD', 'Dean')
  pendingMeetings(@Req() req: { user: AuthUser }) {
    return this.proctor.listPendingMeetings(req.user.user_id);
  }

  @Post('meetings/:meetingId/respond')
  @Roles('Faculty', 'SuperAdmin', 'Registrar', 'HOD', 'Dean')
  respondToMeeting(
    @Param('meetingId') meetingId: string,
    @Req() req: { user: AuthUser },
    @Body() dto: RespondMentorshipMeetingDto,
  ) {
    return this.proctor.respondToMeeting(
      req.user.user_id,
      meetingId,
      dto.status,
      dto.remarks,
    );
  }

  @Get('chat/mentees')
  @Roles('Faculty', 'SuperAdmin', 'Registrar', 'HOD', 'Dean')
  chatMentees(@Req() req: { user: AuthUser }) {
    return this.chat.listMenteesWithChatSummary(req.user.user_id);
  }

  @Get('chat/thread/:studentUserId')
  @Roles('Faculty', 'SuperAdmin', 'Registrar', 'HOD', 'Dean')
  chatThread(
    @Param('studentUserId') studentUserId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.chat.getThread(req.user.user_id, studentUserId, true);
  }

  @Post('chat')
  @Roles('Student', 'Faculty', 'SuperAdmin', 'Registrar', 'HOD', 'Dean')
  sendChat(@Req() req: { user: AuthUser }, @Body() dto: SendMentorshipChatDto) {
    if (dto.student_user_id) {
      return this.chat.sendFacultyMessage(
        req.user.user_id,
        dto.student_user_id,
        dto.message,
      );
    }
    return this.chat.sendStudentMessage(req.user.user_id, dto.message);
  }

  @Get('chat/my')
  @Roles('Student')
  myChatThread(@Req() req: { user: AuthUser }) {
    return this.chat.getStudentThread(req.user.user_id);
  }

  /** @deprecated Use POST /chat — kept for backward compatibility */
  @Post('messages')
  @Roles('Student')
  sendMessage(
    @Req() req: { user: AuthUser },
    @Body() dto: SendProctorMessageDto,
  ) {
    return this.chat.sendStudentMessage(req.user.user_id, dto.message);
  }

  /** @deprecated Use GET /chat/my */
  @Get('messages/my')
  @Roles('Student')
  myMessages(@Req() req: { user: AuthUser }) {
    return this.chat.getStudentThread(req.user.user_id);
  }

  /** @deprecated Use GET /chat/mentees */
  @Get('messages/inbox')
  @Roles('Faculty', 'SuperAdmin', 'Registrar', 'HOD', 'Dean')
  messageInbox(@Req() req: { user: AuthUser }) {
    return this.chat.listMenteesWithChatSummary(req.user.user_id);
  }

  @Post('messages/:interactionId/reply')
  @Roles('Faculty', 'SuperAdmin', 'Registrar', 'HOD', 'Dean')
  replyToMessage(
    @Req() req: { user: AuthUser },
    @Param('interactionId') interactionId: string,
    @Body() body: { reply: string },
  ) {
    return this.proctor.replyToMessage(
      req.user.user_id,
      interactionId,
      body.reply,
    );
  }

  @Post('leave-requests')
  @Roles('Student')
  submitLeaveRequest(
    @Req() req: { user: AuthUser },
    @Body() dto: SubmitMentorLeaveRequestDto,
  ) {
    return this.proctor.submitLeaveRequest(
      req.user.user_id,
      dto.reason,
      dto.start_date,
      dto.end_date,
    );
  }

  @Get('leave-requests/my')
  @Roles('Student')
  myLeaveRequests(@Req() req: { user: AuthUser }) {
    return this.proctor.listStudentLeaveRequests(req.user.user_id);
  }

  @Get('leave-requests/pending')
  @Roles('Faculty', 'SuperAdmin', 'Registrar', 'HOD', 'Dean')
  pendingLeaveRequests(@Req() req: { user: AuthUser }) {
    return this.proctor.listPendingLeaveRequests(req.user.user_id);
  }

  @Post('leave-requests/:interactionId/respond')
  @Roles('Faculty', 'SuperAdmin', 'Registrar', 'HOD', 'Dean')
  respondToLeaveRequest(
    @Param('interactionId') interactionId: string,
    @Req() req: { user: AuthUser },
    @Body() dto: RespondMentorLeaveRequestDto,
  ) {
    return this.proctor.respondToLeaveRequest(
      req.user.user_id,
      interactionId,
      dto.status,
      dto.remarks,
    );
  }

  @Get('my-students')
  @Roles('Faculty', 'SuperAdmin', 'Registrar', 'HOD', 'Dean')
  getMyStudents(@Req() req: { user: AuthUser }) {
    return this.proctor.getMyAssignedStudents(req.user.user_id);
  }

  @Get('pending-approvals')
  @Roles('Faculty', 'SuperAdmin', 'Registrar', 'HOD', 'Dean')
  getPendingApprovals(@Req() req: { user: AuthUser }) {
    return this.proctor.getPendingApprovals(
      req.user.user_id,
      this.resolveTenantId(req.user),
    );
  }

  @Post('approve-certificate')
  @Roles('Faculty', 'SuperAdmin', 'Registrar', 'HOD', 'Dean')
  approveCertificate(
    @Req() req: { user: AuthUser },
    @Body()
    dto: {
      certificate_id: string;
      status?: 'VERIFIED' | 'REJECTED';
      rejection_reason?: string;
    },
  ) {
    return this.proctor.approveCertificate(
      req.user.user_id,
      this.resolveTenantId(req.user),
      dto.certificate_id,
      dto.status ?? 'VERIFIED',
      dto.rejection_reason,
    );
  }

  private resolveTenantId(user: AuthUser) {
    return user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
