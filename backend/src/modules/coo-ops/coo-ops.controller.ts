import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CooOpsService } from './coo-ops.service';
import { ProcurementService } from './procurement.service';

type AuthUser = { user_id: string; tenant_id?: string; role?: string; roles?: string[] };

/** Requestor — raise PR only */
const REQUESTOR = [
  'HOD',
  'LabAdmin',
  'Faculty',
  'Warden',
  'EstateOfficer',
  'SuperAdmin',
  'CampusAdmin',
] as const;

/** Central Procurement — quotes + sourcing */
const PROCUREMENT = [
  'Procurement',
  'ProcurementHead',
  'ProcurementBuyer',
  'SuperAdmin',
] as const;

/** Stores gatekeepers (+ admin override for UAT) */
const STORES = ['Stores', 'Security', 'ReceivingClerk', 'SuperAdmin', 'CampusAdmin'] as const;

/** Finance AP — 3-way match + pay (AP Manager primary; CFO / Accountant compat) */
const FINANCE_AP = [
  'APManager',
  'APClerk',
  'CFO',
  'Accountant',
  'FinanceController',
  'SuperAdmin',
] as const;

/** Readers / oversight */
const P2P_READ = [
  ...REQUESTOR,
  ...PROCUREMENT,
  ...STORES,
  ...FINANCE_AP,
  'COO',
  'Dean',
  'Chairman',
  'President',
  'InternalAuditor',
] as const;

/** Who can sign DOFA levels (inbox) */
const APPROVERS = [
  'HOD',
  'LabAdmin',
  'Dean',
  'CampusAdmin',
  'ProcurementHead',
  'FinanceController',
  'CFO',
  'COO',
  'Chairman',
  'President',
  'SuperAdmin',
] as const;

/** Org chart / pillars */
const ORG_READ = [
  'Chairman',
  'President',
  'COO',
  'CFO',
  'InternalAuditor',
  'CampusAdmin',
  'SuperAdmin',
  'HR',
  'HRAdmin',
] as const;

@Controller('api/operations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CooOpsController {
  constructor(
    private readonly ops: CooOpsService,
    private readonly procurement: ProcurementService,
  ) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  private primaryRole(user: AuthUser) {
    return user.role ?? user.roles?.[0] ?? 'Accountant';
  }

  @Get('dashboard')
  @Roles('COO', 'EstateOfficer', 'Chairman', 'President', 'SuperAdmin', 'CampusAdmin', 'CFO')
  dashboard(@Req() req: { user: AuthUser }) {
    return this.ops.dashboard(this.tenant(req));
  }

  @Get('org/pillars')
  @Roles(...ORG_READ)
  orgPillars(@Req() req: { user: AuthUser }) {
    return this.ops.orgPillars(this.tenant(req));
  }

  @Get('esm/queues')
  @Roles('COO', 'EstateOfficer', 'SuperAdmin', 'CampusAdmin')
  queues(@Req() req: { user: AuthUser }) {
    return this.ops.listQueues(this.tenant(req));
  }

  @Get('esm/locations')
  @Roles('COO', 'EstateOfficer', 'SuperAdmin', 'CampusAdmin', 'Student', 'Faculty')
  locations(@Req() req: { user: AuthUser }) {
    return this.ops.listLocations(this.tenant(req));
  }

  @Post('esm/from-qr')
  @Roles('COO', 'EstateOfficer', 'Student', 'Faculty', 'SuperAdmin', 'CampusAdmin')
  fromQr(
    @Req() req: { user: AuthUser },
    @Body() body: { qr_code: string; subject?: string },
  ) {
    return this.ops.createTicketFromQr(
      this.tenant(req),
      req.user.user_id,
      body.qr_code,
      body.subject,
    );
  }

  @Post('esm/tickets/:id/scan-close')
  @Roles('COO', 'EstateOfficer', 'SuperAdmin', 'CampusAdmin')
  scanClose(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.ops.scanCloseTicket(this.tenant(req), req.user.user_id, id);
  }

  @Get('esm/tickets')
  @Roles('COO', 'EstateOfficer', 'SuperAdmin', 'CampusAdmin', 'Chairman', 'President')
  tickets(@Req() req: { user: AuthUser }) {
    return this.ops.listOpenTickets(this.tenant(req));
  }

  @Get('p2p/dofa')
  @Roles(...P2P_READ)
  dofa(@Req() req: { user: AuthUser }) {
    return this.ops.listDofa(this.tenant(req));
  }

  @Get('p2p/dofa/levels')
  @Roles(...P2P_READ)
  dofaLevels(@Req() req: { user: AuthUser }) {
    return this.procurement.listDofaLevels(this.tenant(req));
  }

  @Get('p2p/purchase-orders')
  @Roles(...P2P_READ)
  pos(@Req() req: { user: AuthUser }) {
    return this.ops.listPurchaseOrders(this.tenant(req));
  }

  /** Direct PO create — Procurement / SuperAdmin only (bypass discouraged) */
  @Post('p2p/purchase-orders')
  @Roles(...PROCUREMENT)
  createPo(
    @Req() req: { user: AuthUser },
    @Body() body: { description: string; amount: number; vendor_id?: string; program_id?: string },
  ) {
    return this.ops.createPoWithDofa(
      this.tenant(req),
      req.user.user_id,
      this.primaryRole(req.user),
      body,
    );
  }

  @Get('p2p/grn')
  @Roles(...STORES, ...FINANCE_AP, 'COO', 'Chairman', 'President', 'CampusAdmin')
  grns(@Req() req: { user: AuthUser }) {
    return this.ops.listGrns(this.tenant(req));
  }

  @Get('p2p/vendors')
  @Roles('COO', 'Accountant', 'SuperAdmin', 'CampusAdmin')
  vendors(@Req() req: { user: AuthUser }) {
    return this.ops.listVendors(this.tenant(req));
  }

  @Post('p2p/grn')
  @Roles(...STORES)
  createGrn(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      po_id: string;
      notes?: string;
      qty_received?: number;
      photo_path?: string;
      challan_path?: string;
      asset_barcode?: string;
      received_at_gate?: boolean;
    },
  ) {
    return this.ops.createGrn(this.tenant(req), req.user.user_id, body);
  }

  @Post('p2p/purchase-orders/:id/invoice')
  @Roles('COO', 'Accountant', 'SuperAdmin', 'CampusAdmin')
  createInvoice(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.ops.createVendorInvoiceForPo(this.tenant(req), id);
  }

  @Get('p2p/purchase-orders/:id/three-way-match')
  @Roles(...FINANCE_AP, 'COO', 'CampusAdmin', 'Chairman', 'President')
  match(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.ops.threeWayMatch(this.tenant(req), id);
  }

  @Post('p2p/purchase-orders/:id/pay')
  @Roles(...FINANCE_AP)
  payPo(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.ops.payPurchaseOrder(this.tenant(req), req.user.user_id, id);
  }

  @Get('p2p/penalties')
  @Roles(...FINANCE_AP, 'COO', 'CampusAdmin', 'Chairman')
  penalties(@Req() req: { user: AuthUser }) {
    return this.ops.listPenalties(this.tenant(req));
  }

  @Post('p2p/penalties')
  @Roles(...FINANCE_AP, 'COO', 'EstateOfficer', 'HelpdeskDispatcher')
  applyPenalty(
    @Req() req: { user: AuthUser },
    @Body() body: { vendor_id: string; reason: string; amount_inr: number },
  ) {
    return this.ops.applyPenalty(this.tenant(req), body);
  }

  // --- Requisitions (Requestor) ---

  @Get('p2p/requisitions')
  @Roles(...P2P_READ)
  listPr(
    @Req() req: { user: AuthUser },
    @Query('status') status?: string,
  ) {
    return this.procurement.listRequisitions(this.tenant(req), status);
  }

  @Get('p2p/requisitions/:id')
  @Roles(...P2P_READ)
  getPr(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.procurement.getRequisition(this.tenant(req), id);
  }

  @Post('p2p/requisitions')
  @Roles(...REQUESTOR)
  createPr(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      description: string;
      amount_estimate: number;
      dept_id?: number;
      technical_specs?: string;
      budget_id?: string;
      program_id?: string;
      grant_id?: string;
      grant_expense_category?: string;
    },
  ) {
    return this.procurement.createRequisition(
      this.tenant(req),
      req.user.user_id,
      body,
    );
  }

  // --- Procurement sourcing ---

  @Post('p2p/requisitions/:id/claim')
  @Roles(...PROCUREMENT)
  claimPr(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.procurement.claimRequisition(
      this.tenant(req),
      req.user.user_id,
      id,
    );
  }

  @Post('p2p/requisitions/:id/quotes')
  @Roles(...PROCUREMENT)
  addQuote(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body()
    body: {
      vendor_name: string;
      gstin: string;
      amount_inr: number;
      pdf_path: string;
      vendor_id?: string;
    },
  ) {
    return this.procurement.addQuote(this.tenant(req), id, body);
  }

  @Post('p2p/requisitions/:id/submit-for-approval')
  @Roles(...PROCUREMENT)
  submitForApproval(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body()
    body: { selected_quote_id: string; non_lowest_justification?: string },
  ) {
    return this.procurement.submitForApproval(
      this.tenant(req),
      req.user.user_id,
      id,
      body,
    );
  }

  /** Legacy alias → submitForApproval */
  @Post('p2p/requisitions/:id/submit')
  @Roles(...PROCUREMENT)
  submitPr(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body()
    body: {
      selected_quote_id: string;
      l2_justification?: string;
      non_lowest_justification?: string;
    },
  ) {
    return this.procurement.submitForApproval(
      this.tenant(req),
      req.user.user_id,
      id,
      {
        selected_quote_id: body.selected_quote_id,
        non_lowest_justification:
          body.non_lowest_justification ?? body.l2_justification,
      },
    );
  }

  @Get('p2p/approvals/inbox')
  @Roles(...APPROVERS)
  approvalsInbox(@Req() req: { user: AuthUser }) {
    return this.procurement.listPendingApprovals(
      this.tenant(req),
      this.primaryRole(req.user),
    );
  }

  @Post('p2p/requisitions/:id/approve')
  @Roles(...APPROVERS)
  approvePr(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body?: { notes?: string; decision?: 'APPROVED' | 'REJECTED' },
  ) {
    return this.procurement.approveAtLevel(
      this.tenant(req),
      req.user.user_id,
      this.primaryRole(req.user),
      id,
      body,
    );
  }

  // --- Catalog ---

  @Get('p2p/catalog')
  @Roles(...P2P_READ)
  catalog(@Req() req: { user: AuthUser }) {
    return this.procurement.listCatalog(this.tenant(req));
  }

  @Post('p2p/catalog')
  @Roles(...PROCUREMENT, 'COO', 'CampusAdmin')
  upsertCatalog(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      sku: string;
      name: string;
      category?: string;
      unit?: string;
      locked_unit_price: number;
      vendor_id: string;
      catalog_item_id?: string;
    },
  ) {
    return this.procurement.upsertCatalogItem(this.tenant(req), body);
  }

  @Put('p2p/catalog/:id')
  @Roles(...PROCUREMENT, 'COO', 'CampusAdmin')
  updateCatalog(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body()
    body: {
      sku: string;
      name: string;
      category?: string;
      unit?: string;
      locked_unit_price: number;
      vendor_id: string;
    },
  ) {
    return this.procurement.upsertCatalogItem(this.tenant(req), {
      ...body,
      catalog_item_id: id,
    });
  }

  @Post('p2p/catalog/order')
  @Roles(...REQUESTOR, ...PROCUREMENT)
  orderCatalog(
    @Req() req: { user: AuthUser },
    @Body() body: { catalog_item_id: string; qty: number },
  ) {
    return this.procurement.orderFromCatalog(
      this.tenant(req),
      req.user.user_id,
      this.primaryRole(req.user),
      body,
    );
  }

  // --- Analytics / GST ---

  @Get('p2p/analytics/fraud-signals')
  @Roles(
    ...FINANCE_AP,
    'COO',
    'Chairman',
    'President',
    'CampusAdmin',
    'ProcurementHead',
    'InternalAuditor',
  )
  fraudSignals(@Req() req: { user: AuthUser }) {
    return this.procurement.fraudSignals(this.tenant(req));
  }

  @Post('p2p/analytics/invoice-split-scan')
  @Roles(...FINANCE_AP, 'COO', 'Chairman', 'President', 'SuperAdmin', 'ProcurementHead')
  splitScan(@Req() req: { user: AuthUser }) {
    return this.procurement.runNightlyInvoiceSplitScan(this.tenant(req));
  }

  @Post('p2p/vendors/:id/verify-gst')
  @Roles(...PROCUREMENT, ...FINANCE_AP)
  verifyGst(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.procurement.verifyVendorGst(this.tenant(req), id);
  }
}
