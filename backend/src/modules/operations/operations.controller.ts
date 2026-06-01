import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { OperationsService } from './operations.service';
import { RequestGatePassDto } from './dto/request-gate-pass.dto';
import { CreateLibraryBookDto } from './dto/create-library-book.dto';
import { CreateTransportRouteDto } from './dto/create-transport-route.dto';

@Controller('operations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OperationsController {
  constructor(private readonly ops: OperationsService) {}

  @Get('hostel/rooms')
  listRooms() {
    return this.ops.listRooms();
  }

  @Post('gate-passes')
  requestPass(@Body() dto: RequestGatePassDto) {
    return this.ops.requestGatePass(dto);
  }

  @Patch('gate-passes/:id/approve')
  @Roles('Warden', 'SuperAdmin')
  approvePass(@Param('id') id: string, @Req() req: { user?: { sub?: string } }) {
    return this.ops.approveGatePass(id, req.user?.sub ?? '');
  }

  @Get('gate-passes')
  listPasses(@Query('studentUserId') studentUserId?: string) {
    return this.ops.listGatePasses(studentUserId);
  }

  @Get('library/books')
  listBooks() {
    return this.ops.listBooks();
  }

  @Post('library/books')
  @Roles('Librarian', 'SuperAdmin')
  createBook(@Body() dto: CreateLibraryBookDto) {
    return this.ops.createBook(dto);
  }

  @Get('transport/routes')
  listRoutes() {
    return this.ops.listRoutes();
  }

  @Post('transport/routes')
  @Roles('TransportOfficer', 'SuperAdmin')
  createRoute(@Body() dto: CreateTransportRouteDto) {
    return this.ops.createRoute(dto);
  }
}
