import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { IamService } from './iam.service';
import { CreateCampusDto } from './dto/create-campus.dto';
import { CreateSchoolDto } from './dto/create-school.dto';
import { CreateProgramDto } from './dto/create-program.dto';

@Controller('iam')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IamController {
  constructor(private readonly iam: IamService) {}

  @Get('campuses')
  listCampuses() {
    return this.iam.listCampuses();
  }

  @Post('campuses')
  @Roles('Admin', 'SuperAdmin')
  createCampus(@Body() dto: CreateCampusDto) {
    return this.iam.createCampus(dto);
  }

  @Get('schools')
  listSchools() {
    return this.iam.listSchools();
  }

  @Post('schools')
  @Roles('Admin', 'SuperAdmin')
  createSchool(@Body() dto: CreateSchoolDto) {
    return this.iam.createSchool(dto);
  }

  @Get('programs')
  listPrograms() {
    return this.iam.listPrograms();
  }

  @Post('programs')
  @Roles('Admin', 'SuperAdmin')
  createProgram(@Body() dto: CreateProgramDto) {
    return this.iam.createProgram(dto);
  }
}
