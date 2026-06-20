import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateDeviceTokenDto } from './dto/update-device-token.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller(['users', 'api/users'])
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles('IQAC', 'HR')
  createUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createUser(createUserDto);
  }

  @Get()
  @Roles('IQAC', 'HR', 'President', 'Dean')
  findAllUsers() {
    return this.usersService.findAllUsers();
  }

  @Get('active')
  @Roles('IQAC', 'HR', 'President', 'Dean')
  findActiveUsers() {
    return this.usersService.findActiveUsers();
  }

  @Get('role/:roleName')
  @Roles('IQAC', 'HR', 'President', 'Dean')
  findUsersByRole(@Param('roleName') roleName: string) {
    return this.usersService.findUsersByRole(roleName);
  }

  @Get('department/:deptId')
  @Roles('IQAC', 'HR', 'President', 'Dean')
  findUsersByDepartment(@Param('deptId') deptId: string) {
    return this.usersService.findUsersByDepartment(parseInt(deptId));
  }

  @Get('me')
  getMyProfile(@Req() req: any) {
    return this.usersService.findOneUser(req.user.user_id);
  }

  @Patch('me/device-token')
  updateMyDeviceToken(@Req() req: any, @Body() dto: UpdateDeviceTokenDto) {
    return this.usersService.updateDeviceToken(
      req.user.user_id,
      dto.device_token,
    );
  }

  @Get('stats')
  @Roles('IQAC', 'HR', 'President')
  getUserStatistics() {
    return this.usersService.getUserStatistics();
  }

  @Get(':id')
  @Roles('IQAC', 'HR', 'President', 'Dean')
  findOneUser(@Param('id') id: string) {
    return this.usersService.findOneUser(id);
  }

  @Put(':id')
  @Roles('IQAC', 'HR')
  updateUser(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.updateUser(id, updateUserDto);
  }

  @Put(':id/deactivate')
  @Roles('IQAC', 'HR')
  deactivateUser(@Param('id') id: string) {
    return this.usersService.deactivateUser(id);
  }

  @Put(':id/activate')
  @Roles('IQAC', 'HR')
  activateUser(@Param('id') id: string) {
    return this.usersService.activateUser(id);
  }

  @Put(':id/role/:roleId')
  @Roles('IQAC', 'HR')
  updateUserRole(@Param('id') id: string, @Param('roleId') roleId: string) {
    return this.usersService.updateUserRole(id, parseInt(roleId));
  }

  @Put(':id/department/:deptId')
  @Roles('IQAC', 'HR')
  updateUserDepartment(
    @Param('id') id: string,
    @Param('deptId') deptId: string,
  ) {
    return this.usersService.updateUserDepartment(id, parseInt(deptId));
  }
}
