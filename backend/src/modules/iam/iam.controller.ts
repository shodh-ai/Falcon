import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { IamService } from './iam.service';
import { CreateCampusDto } from './dto/create-campus.dto';
import { CreateSchoolDto } from './dto/create-school.dto';
import { CreateProgramDto } from './dto/create-program.dto';
import { CampusScopeService } from '../../common/campus-scope/campus-scope.service';
import type { ScopedAuthUser } from '../../common/campus-scope/campus-scope.service';

@Controller('iam')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IamController {
  constructor(
    private readonly iam: IamService,
    private readonly campusScope: CampusScopeService,
  ) {}

  @Get('campuses')
  async listCampuses(@Req() req: { user: ScopedAuthUser }) {
    const rows = await this.iam.listCampuses();
    const campusIds = await this.campusScope.resolveCampusIds(req.user);
    if (!campusIds) return rows;
    return rows.filter((row) => campusIds.includes(Number(row.campus_id)));
  }

  @Post('campuses')
  @Roles('SuperAdmin')
  createCampus(@Body() dto: CreateCampusDto) {
    return this.iam.createCampus(dto);
  }

  @Get('schools')
  async listSchools(@Req() req: { user: ScopedAuthUser }) {
    const rows = await this.iam.listSchools();
    const campusIds = await this.campusScope.resolveCampusIds(req.user);
    if (!campusIds) return rows;
    return rows.filter((row) => campusIds.includes(Number(row.campus_id)));
  }

  @Post('schools')
  @Roles('SuperAdmin')
  createSchool(@Body() dto: CreateSchoolDto) {
    return this.iam.createSchool(dto);
  }

  @Get('programs')
  async listPrograms(@Req() req: { user: ScopedAuthUser }) {
    const rows = await this.iam.listPrograms();
    const campusIds = await this.campusScope.resolveCampusIds(req.user);
    if (!campusIds) return rows;
    const schools = await this.iam.listSchools();
    const allowedSchoolIds = new Set(
      schools
        .filter((school) => campusIds.includes(Number(school.campus_id)))
        .map((school) => Number(school.school_id)),
    );
    return rows.filter((row) => allowedSchoolIds.has(Number(row.school_id)));
  }

  @Post('programs')
  @Roles('SuperAdmin')
  createProgram(@Body() dto: CreateProgramDto) {
    return this.iam.createProgram(dto);
  }
}
