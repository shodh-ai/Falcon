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
import { LibraryService } from './library.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/library')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('search')
  @Roles('Student', 'Faculty', 'HOD', 'Dean', 'SuperAdmin', 'Librarian')
  search(
    @Req() req: { user: AuthUser },
    @Query('q') q = '',
    @Query('limit') limit?: string,
  ) {
    return this.library.searchCatalog(
      this.tenant(req),
      q,
      limit ? Number(limit) : 24,
    );
  }

  @Get('catalog/:catalogId')
  @Roles('Student', 'Faculty', 'HOD', 'Dean', 'SuperAdmin', 'Librarian')
  detail(
    @Req() req: { user: AuthUser },
    @Param('catalogId') catalogId: string,
  ) {
    return this.library.getCatalogDetail(this.tenant(req), catalogId);
  }

  @Post('reservations')
  @Roles('Student', 'Faculty', 'HOD', 'Dean', 'SuperAdmin')
  placeHold(
    @Req() req: { user: AuthUser },
    @Body() dto: { catalog_id: string },
  ) {
    return this.library.placeHold(
      this.tenant(req),
      req.user.user_id,
      dto.catalog_id,
    );
  }

  @Get('my-account')
  @Roles('Student', 'Faculty', 'HOD', 'Dean', 'SuperAdmin')
  myAccount(@Req() req: { user: AuthUser }) {
    return this.library.getMyAccount(this.tenant(req), req.user.user_id);
  }

  @Post('renew/:transactionId')
  @Roles('Student', 'Faculty', 'HOD', 'Dean', 'SuperAdmin')
  renew(
    @Req() req: { user: AuthUser },
    @Param('transactionId') transactionId: string,
  ) {
    return this.library.renewLoan(
      this.tenant(req),
      req.user.user_id,
      transactionId,
    );
  }

  @Get('digital-resources')
  @Roles('Student', 'Faculty', 'SuperAdmin', 'Librarian')
  digital(@Req() req: { user: AuthUser }) {
    return this.library.listDigitalResources(this.tenant(req));
  }
}

@Controller('api/library-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LibraryAdminController {
  constructor(private readonly library: LibraryService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('patron-lookup')
  @Roles('Librarian', 'SuperAdmin')
  patronLookup(
    @Req() req: { user: AuthUser },
    @Query('barcode') barcode: string,
  ) {
    return this.library.resolveUserByBarcode(this.tenant(req), barcode);
  }

  @Post('circulation/issue')
  @Roles('Librarian', 'SuperAdmin')
  issue(
    @Req() req: { user: AuthUser },
    @Body() dto: { user_id: string; accession_number: string },
  ) {
    return this.library.issueCopy(
      this.tenant(req),
      dto.user_id,
      dto.accession_number,
      req.user.user_id,
    );
  }

  @Post('circulation/return')
  @Roles('Librarian', 'SuperAdmin')
  returnBook(
    @Req() req: { user: AuthUser },
    @Body() dto: { accession_number: string },
  ) {
    return this.library.returnCopy(this.tenant(req), dto.accession_number);
  }

  @Get('isbn-lookup')
  @Roles('Librarian', 'SuperAdmin')
  isbnLookup(@Query('isbn') isbn: string) {
    return this.library.lookupIsbn(isbn);
  }

  @Post('catalog')
  @Roles('Librarian', 'SuperAdmin')
  saveCatalog(
    @Req() req: { user: AuthUser },
    @Body() dto: Record<string, unknown>,
  ) {
    return this.library.saveCatalogWithCopies(this.tenant(req), dto as never);
  }

  @Get('defaulters')
  @Roles('Librarian', 'SuperAdmin')
  defaulters(@Req() req: { user: AuthUser }) {
    return this.library.listDefaulters(this.tenant(req));
  }

  @Post('fines/push')
  @Roles('Librarian', 'SuperAdmin')
  pushFine(
    @Req() req: { user: AuthUser },
    @Body() dto: { transaction_id: string },
  ) {
    return this.library.pushFineToFinance(this.tenant(req), dto.transaction_id);
  }

  @Post('gate/check-in')
  @Roles('Librarian', 'SuperAdmin', 'Student', 'Faculty')
  async gateIn(
    @Req() req: { user: AuthUser },
    @Body() dto: { user_id?: string; barcode?: string },
  ) {
    const tenantId = this.tenant(req);
    const userId =
      dto.user_id ??
      (
        await this.library.resolveUserByBarcode(
          tenantId,
          dto.barcode ?? req.user.user_id,
        )
      ).user_id;
    return this.library.gateCheckIn(tenantId, userId);
  }

  @Post('gate/check-out')
  @Roles('Librarian', 'SuperAdmin', 'Student', 'Faculty')
  async gateOut(
    @Req() req: { user: AuthUser },
    @Body() dto: { user_id?: string; barcode?: string },
  ) {
    const tenantId = this.tenant(req);
    const userId =
      dto.user_id ??
      (
        await this.library.resolveUserByBarcode(
          tenantId,
          dto.barcode ?? req.user.user_id,
        )
      ).user_id;
    return this.library.gateCheckOut(tenantId, userId);
  }

  @Get('gate/stats')
  @Roles('Librarian', 'SuperAdmin')
  gateStats(@Req() req: { user: AuthUser }) {
    return this.library.gateStats(this.tenant(req));
  }

  @Get('dashboard/metrics')
  @Roles('Librarian', 'SuperAdmin')
  dashboardMetrics(@Req() req: { user: AuthUser }) {
    return this.library.getDashboardMetrics(this.tenant(req));
  }

  @Get('reports/naac-utilization')
  @Roles('Librarian', 'SuperAdmin')
  naacReport(@Req() req: { user: AuthUser }, @Query('month') month?: string) {
    return this.library.exportNaacUtilizationReport(this.tenant(req), month);
  }

  /** Alias for circulation desk integrations */
  @Post('issue')
  @Roles('Librarian', 'SuperAdmin')
  issueAlias(
    @Req() req: { user: AuthUser },
    @Body() dto: { user_id: string; accession_number: string },
  ) {
    return this.library.issueCopy(
      this.tenant(req),
      dto.user_id,
      dto.accession_number,
      req.user.user_id,
    );
  }
}
