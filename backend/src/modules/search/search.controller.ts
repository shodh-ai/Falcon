import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SearchService } from './search.service';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  primaryRole?: string;
};

@Controller('api/search')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  private ctx(req: { user: AuthUser }) {
    return {
      userId: req.user.user_id,
      tenantId: req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001',
      role: req.user.primaryRole ?? req.user.role ?? 'Faculty',
    };
  }

  @Get()
  unified(@Req() req: { user: AuthUser }, @Query('q') q?: string) {
    const { userId, tenantId, role } = this.ctx(req);
    return this.search.unifiedSearch(userId, tenantId, role, q ?? '');
  }

  @Get('global')
  global(@Req() req: { user: AuthUser }, @Query('q') q?: string) {
    const { userId, tenantId, role } = this.ctx(req);
    return this.search.unifiedSearch(userId, tenantId, role, q ?? '');
  }

  @Get('directory/filters')
  directoryFilters(@Req() req: { user: AuthUser }) {
    const { userId, tenantId, role } = this.ctx(req);
    return this.search.getDirectoryFilterOptions(userId, tenantId, role);
  }

  @Get('directory/export')
  async directoryExport(
    @Req() req: { user: AuthUser },
    @Res() res: Response,
    @Query('role') roleFilter?: string,
    @Query('department') department?: string,
    @Query('status') status?: string,
    @Query('batch') batch?: string,
    @Query('q') q?: string,
  ) {
    const { userId, tenantId, role } = this.ctx(req);
    const csv = await this.search.exportDirectoryCsv(userId, tenantId, role, {
      q,
      role: roleFilter,
      department,
      status,
      batch,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="university-directory.csv"',
    );
    res.send(csv);
  }

  @Get('directory')
  directory(
    @Req() req: { user: AuthUser },
    @Query('role') roleFilter?: string,
    @Query('department') department?: string,
    @Query('status') status?: string,
    @Query('batch') batch?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
  ) {
    const { userId, tenantId, role } = this.ctx(req);
    return this.search.browseDirectory(userId, tenantId, role, {
      q,
      role: roleFilter,
      department,
      status,
      batch,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 25,
    });
  }

  @Get('profile/:userId')
  profile(@Req() req: { user: AuthUser }, @Param('userId') userId: string) {
    const ctx = this.ctx(req);
    return this.search.getProfile360(
      ctx.userId,
      ctx.tenantId,
      ctx.role,
      userId,
    );
  }
}
