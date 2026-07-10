import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MasterDataService } from './master-data.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/master-data')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MasterDataController {
  constructor(private readonly masterData: MasterDataService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('birthdays/today')
  @Roles('SuperAdmin', 'Dean', 'HR', 'President', 'Faculty')
  todayBirthdays(@Req() req: { user: AuthUser }) {
    return this.masterData.getTodayBirthdays(this.tenant(req));
  }

  @Get('birthdays/faculty/department')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  departmentFacultyBirthdays(
    @Req() req: { user: AuthUser },
    @Query('scope') scope?: string,
  ) {
    const resolvedScope = scope === 'dean' ? 'dean' : 'hod';
    return this.masterData.getDepartmentFacultyBirthdays(
      this.tenant(req),
      req.user.user_id,
      resolvedScope,
    );
  }

  @Get('countries')
  @Roles('SuperAdmin')
  countries(@Req() req: { user: AuthUser }) {
    return this.masterData.listCountries(this.tenant(req));
  }

  @Post('countries')
  @Roles('SuperAdmin')
  createCountry(
    @Req() req: { user: AuthUser },
    @Body() body: { name: string; code?: string },
  ) {
    return this.masterData.createCountry(
      this.tenant(req),
      body.name,
      body.code,
    );
  }

  @Get('states')
  @Roles('SuperAdmin')
  states(
    @Req() req: { user: AuthUser },
    @Query('countryId') countryId?: string,
  ) {
    return this.masterData.listStates(
      this.tenant(req),
      countryId ? Number(countryId) : undefined,
    );
  }

  @Post('states')
  @Roles('SuperAdmin')
  createState(
    @Req() req: { user: AuthUser },
    @Body() body: { country_id: number; name: string; code?: string },
  ) {
    return this.masterData.createState(
      this.tenant(req),
      body.country_id,
      body.name,
      body.code,
    );
  }

  @Get('cities')
  @Roles('SuperAdmin')
  cities(@Req() req: { user: AuthUser }, @Query('stateId') stateId?: string) {
    return this.masterData.listCities(
      this.tenant(req),
      stateId ? Number(stateId) : undefined,
    );
  }

  @Post('cities')
  @Roles('SuperAdmin')
  createCity(
    @Req() req: { user: AuthUser },
    @Body() body: { state_id: number; name: string },
  ) {
    return this.masterData.createCity(
      this.tenant(req),
      body.state_id,
      body.name,
    );
  }

  @Get('castes')
  @Roles('SuperAdmin')
  castes(@Req() req: { user: AuthUser }) {
    return this.masterData.listCastes(this.tenant(req));
  }

  @Post('castes')
  @Roles('SuperAdmin')
  createCaste(@Req() req: { user: AuthUser }, @Body() body: { name: string }) {
    return this.masterData.createCaste(this.tenant(req), body.name);
  }

  @Get('categories')
  @Roles('SuperAdmin')
  categories(@Req() req: { user: AuthUser }) {
    return this.masterData.listCategories(this.tenant(req));
  }

  @Post('categories')
  @Roles('SuperAdmin')
  createCategory(
    @Req() req: { user: AuthUser },
    @Body() body: { name: string },
  ) {
    return this.masterData.createCategory(this.tenant(req), body.name);
  }

  @Get('religions')
  @Roles('SuperAdmin')
  religions(@Req() req: { user: AuthUser }) {
    return this.masterData.listReligions(this.tenant(req));
  }

  @Post('religions')
  @Roles('SuperAdmin')
  createReligion(
    @Req() req: { user: AuthUser },
    @Body() body: { name: string },
  ) {
    return this.masterData.createReligion(this.tenant(req), body.name);
  }

  @Get('enrollment-rules')
  @Roles('SuperAdmin')
  enrollmentRules(@Req() req: { user: AuthUser }) {
    return this.masterData.listEnrollmentRules(this.tenant(req));
  }

  @Post('enrollment-rules')
  @Roles('SuperAdmin')
  createEnrollmentRule(
    @Req() req: { user: AuthUser },
    @Body() body: { rule_name: string; template: string; seq_padding?: number },
  ) {
    return this.masterData.createEnrollmentRule(this.tenant(req), body);
  }

  @Post('enrollment-rules/:ruleId/generate')
  @Roles('SuperAdmin')
  generateEnrollmentId(
    @Req() req: { user: AuthUser },
    @Param('ruleId') ruleId: string,
    @Body() body: { context: Record<string, string | number> },
  ) {
    return this.masterData.generateEnrollmentId(
      this.tenant(req),
      ruleId,
      body.context ?? {},
    );
  }
}
