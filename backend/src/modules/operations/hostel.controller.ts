import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { HostelService } from './hostel.service';
import { CreateHostelRequestDto } from './dto/create-hostel-request.dto';

type AuthUser = { user_id: string; role?: string };

@Controller('api/operations/hostel')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HostelController {
  constructor(private readonly hostel: HostelService) {}

  @Get('my-allocation')
  @Roles('Student')
  myAllocation(@Req() req: { user: AuthUser }) {
    return this.hostel.getMyAllocation(req.user.user_id);
  }

  @Post('requests')
  @Roles('Student')
  createRequest(@Req() req: { user: AuthUser }, @Body() dto: CreateHostelRequestDto) {
    return this.hostel.createRequest(req.user.user_id, dto);
  }

  @Get('requests')
  @Roles('Student')
  listRequests(@Req() req: { user: AuthUser }) {
    return this.hostel.listMyRequests(req.user.user_id);
  }
}
