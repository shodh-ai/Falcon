import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { FacultyAiService } from './faculty-ai.service';
import {
  CreateFacultyAiConversationDto,
  FACULTY_AI_ROLES,
  RenameFacultyAiConversationDto,
  SendFacultyAiMessageDto,
} from './dto/faculty-ai.dto';

type AuthUser = { user_id: string; tenant_id?: string; role?: string };

@Controller('api/faculty-ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...FACULTY_AI_ROLES)
export class FacultyAiController {
  constructor(private readonly facultyAi: FacultyAiService) {}

  @Get('prompts')
  prompts() {
    return this.facultyAi.promptTemplates();
  }

  @Get('context')
  context(@Req() req: { user: AuthUser }) {
    return this.facultyAi.facultyContext(req.user.user_id, req.user.tenant_id);
  }

  @Get('conversations')
  list(@Req() req: { user: AuthUser }, @Query('q') q?: string) {
    return this.facultyAi.listConversations(
      req.user.user_id,
      req.user.tenant_id,
      q,
    );
  }

  @Post('conversations')
  create(
    @Req() req: { user: AuthUser },
    @Body() body: CreateFacultyAiConversationDto,
  ) {
    return this.facultyAi.createConversation(
      req.user.user_id,
      req.user.tenant_id,
      body,
    );
  }

  @Get('conversations/:id')
  getOne(
    @Req() req: { user: AuthUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.facultyAi.getConversation(
      id,
      req.user.user_id,
      req.user.tenant_id,
    );
  }

  @Patch('conversations/:id')
  rename(
    @Req() req: { user: AuthUser },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RenameFacultyAiConversationDto,
  ) {
    return this.facultyAi.renameConversation(
      id,
      req.user.user_id,
      req.user.tenant_id,
      body.title,
    );
  }

  @Delete('conversations/:id')
  remove(
    @Req() req: { user: AuthUser },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.facultyAi.deleteConversation(
      id,
      req.user.user_id,
      req.user.tenant_id,
    );
  }

  @Post('chat')
  chat(@Req() req: { user: AuthUser }, @Body() body: SendFacultyAiMessageDto) {
    return this.facultyAi.sendMessage(
      req.user.user_id,
      req.user.tenant_id,
      body,
    );
  }
}
