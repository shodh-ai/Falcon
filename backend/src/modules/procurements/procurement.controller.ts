import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type {
  ProcurementActor,
  CreateInvoiceInput,
  CreateOrderInput,
  CreateReceiptInput,
  CreateReturnInput,
  CreateServiceAcceptanceInput,
  DownstreamStatusInput,
} from './procurement.types';
import { ProcurementService } from './procurement.service';
import { ProcurementImportService } from './procurement-import.service';
import { ProcurementDocumentService } from './procurement-document.service';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const PROCUREMENT_WORKBOOK_MAX_BYTES = 5 * 1024 * 1024;
export function isAllowedProcurementWorkbook(
  file: Pick<Express.Multer.File, 'originalname' | 'mimetype'>,
) {
  return (
    file.originalname.toLowerCase().endsWith('.xlsx') &&
    file.mimetype === XLSX_MIME
  );
}
const workbookInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: PROCUREMENT_WORKBOOK_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    const valid = isAllowedProcurementWorkbook(file);
    callback(
      valid
        ? null
        : new BadRequestException('Only literal-value .xlsx files are allowed'),
      valid,
    );
  },
});
const documentInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const valid = ['application/pdf', 'image/png', 'image/jpeg'].includes(
      file.mimetype,
    );
    callback(
      valid
        ? null
        : new BadRequestException('Invoice must be a PDF, PNG, or JPEG'),
      valid,
    );
  },
});

@Controller('api/procurements/v1')
@UseGuards(JwtAuthGuard)
export class ProcurementController {
  constructor(
    private readonly procurements: ProcurementService,
    private readonly imports: ProcurementImportService,
    private readonly documents: ProcurementDocumentService,
  ) {}

  private revision(value?: string) {
    const normalized = value?.replace(/^W\//, '').replace(/"/g, '');
    return Number(normalized);
  }

  @Get('sample-invoice')
  async sampleInvoice(@Res() response: Response) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    page.drawText('FALCON MODULE 2 - QA TEST INVOICE', {
      x: 48,
      y: 780,
      size: 18,
      font: bold,
      color: rgb(0.05, 0.16, 0.32),
    });
    const lines = [
      'Invoice number: QA-INV-2026-0001',
      'Invoice date: 2026-09-04',
      'Vendor: Use the vendor shown on the selected Module 2 order',
      'Currency: INR',
      'Item: Test item - replace with the selected order line',
      'Quantity: 1',
      'Unit price: INR 1,000.00',
      'Tax: INR 0.00',
      'Freight: INR 0.00',
      'Total: INR 1,000.00',
      '',
      'QA only. Adjust the entered values to match the selected test order.',
    ];
    lines.forEach((line, index) =>
      page.drawText(line, { x: 48, y: 735 - index * 28, size: 11, font }),
    );
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="falcon-module2-test-invoice.pdf"',
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(Buffer.from(await pdf.save()));
  }

  @Get('dashboard')
  dashboard(@Req() req: { user: ProcurementActor }) {
    return this.procurements.dashboard(req.user);
  }

  @Get('cases')
  list(
    @Req() req: { user: ProcurementActor },
    @Query('status') status?: string,
  ) {
    return this.procurements.list(req.user, status);
  }

  @Get('vendors')
  vendors(@Req() req: { user: ProcurementActor }) {
    return this.procurements.listVendors(req.user);
  }

  @Get('cases/:caseId')
  get(@Req() req: { user: ProcurementActor }, @Param('caseId') caseId: string) {
    return this.procurements.get(req.user, caseId);
  }

  @Get('cases/:caseId/finalization-readiness')
  readiness(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
  ) {
    return this.procurements.finalizationReadiness(req.user, caseId);
  }

  @Get('cases/:caseId/match-policies')
  matchPolicies(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
  ) {
    return this.procurements.listMatchPolicies(req.user, caseId);
  }

  @Get('cases/:caseId/workbook')
  @Header('Content-Type', XLSX_MIME)
  async workbook(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Res() response: Response,
  ) {
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="falcon-procurement-${caseId}.xlsx"`,
    );
    response.send(await this.imports.export(req.user, caseId));
  }

  @Post('cases/:caseId/imports/preview')
  @UseInterceptors(workbookInterceptor)
  preview(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.imports.preview(req.user, caseId, file);
  }

  @Post('cases/:caseId/imports/:previewId/commit')
  commit(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Param('previewId') previewId: string,
  ) {
    return this.imports.commit(req.user, caseId, previewId);
  }

  @Post('cases/:caseId/orders')
  createOrder(
    @Req() req: { user: ProcurementActor; headers: Record<string, string> },
    @Param('caseId') caseId: string,
    @Headers('if-match') revision: string,
    @Body() body: CreateOrderInput,
  ) {
    return this.procurements.createOrder(
      req.user,
      caseId,
      this.revision(revision),
      body,
      req.headers['x-request-id'],
    );
  }

  @Post('cases/:caseId/orders/:orderId/issue')
  issueOrder(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Param('orderId') orderId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.procurements.issueOrder(
      req.user,
      caseId,
      orderId,
      this.revision(revision),
      key,
    );
  }

  @Post('cases/:caseId/orders/:orderId/cancel')
  cancelOrder(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Param('orderId') orderId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: {
      lines: Array<{ order_line_id: string; quantity: number }>;
      reason: string;
    },
  ) {
    return this.procurements.cancelOrder(
      req.user,
      caseId,
      orderId,
      this.revision(revision),
      body,
      key,
    );
  }

  @Post('cases/:caseId/lines/:lineId/cancel')
  cancelCaseLine(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Param('lineId') lineId: string,
    @Headers('if-match') revision: string,
    @Body() body: { quantity: number; reason: string },
  ) {
    return this.procurements.cancelCaseLine(
      req.user,
      caseId,
      lineId,
      this.revision(revision),
      body,
    );
  }

  @Post('cases/:caseId/orders/:orderId/receipts')
  receipt(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Param('orderId') orderId: string,
    @Headers('if-match') revision: string,
    @Body() body: CreateReceiptInput,
  ) {
    return this.procurements.recordReceipt(
      req.user,
      caseId,
      orderId,
      this.revision(revision),
      body,
    );
  }

  @Post('cases/:caseId/service-acceptances')
  serviceAcceptance(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Headers('if-match') revision: string,
    @Body() body: CreateServiceAcceptanceInput,
  ) {
    return this.procurements.recordServiceAcceptance(
      req.user,
      caseId,
      this.revision(revision),
      body,
    );
  }

  @Post('cases/:caseId/service-acceptances/:acceptanceId/verify')
  verifyService(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Param('acceptanceId') acceptanceId: string,
    @Headers('if-match') revision: string,
  ) {
    return this.procurements.verifyServiceAcceptance(
      req.user,
      caseId,
      acceptanceId,
      this.revision(revision),
    );
  }

  @Post('cases/:caseId/orders/:orderId/invoices')
  invoice(
    @Req() req: { user: ProcurementActor; headers: Record<string, string> },
    @Param('caseId') caseId: string,
    @Param('orderId') orderId: string,
    @Headers('if-match') revision: string,
    @Body() body: CreateInvoiceInput,
  ) {
    return this.procurements.createInvoice(
      req.user,
      caseId,
      orderId,
      this.revision(revision),
      body,
      req.headers['x-request-id'],
    );
  }

  @Post('cases/:caseId/invoice-documents')
  @UseInterceptors(documentInterceptor)
  uploadInvoiceDocument(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documents.upload(req.user, caseId, file);
  }

  @Post('cases/:caseId/receipt-evidence')
  @UseInterceptors(documentInterceptor)
  uploadReceiptEvidence(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('purpose') purpose: 'PACKAGE_RECEIPT' | 'RECEIVED_PRODUCT',
    @Body('latitude') latitude: string,
    @Body('longitude') longitude: string,
    @Body('accuracy_metres') accuracy: string,
    @Body('captured_at') capturedAt: string,
    @Body('receipt_line_id') receiptLineId?: string,
  ) {
    if (!['PACKAGE_RECEIPT', 'RECEIVED_PRODUCT'].includes(purpose))
      throw new BadRequestException('Receipt evidence purpose is invalid');
    return this.documents.upload(req.user, caseId, file, purpose, {
      latitude: Number(latitude),
      longitude: Number(longitude),
      accuracy_metres: accuracy ? Number(accuracy) : undefined,
      captured_at: capturedAt,
      receipt_line_id: receiptLineId || undefined,
    });
  }

  @Get('cases/:caseId/invoices/:invoiceId/document')
  async downloadInvoiceDocument(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Param('invoiceId') invoiceId: string,
    @Res() response: Response,
  ) {
    const document = await this.documents.download(req.user, caseId, invoiceId);
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.filename.replace(/["\\\r\n]/g, '_')}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    document.stream.pipe(response);
  }

  @Post('cases/:caseId/invoices/:invoiceId/verify')
  verifyInvoice(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Param('invoiceId') invoiceId: string,
    @Headers('if-match') revision: string,
  ) {
    return this.procurements.verifyInvoice(
      req.user,
      caseId,
      invoiceId,
      this.revision(revision),
    );
  }

  @Post('cases/:caseId/invoices/:invoiceId/void')
  voidInvoice(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Param('invoiceId') invoiceId: string,
    @Headers('if-match') revision: string,
    @Body() body: { reason: string },
  ) {
    return this.procurements.voidInvoice(
      req.user,
      caseId,
      invoiceId,
      this.revision(revision),
      body.reason,
    );
  }

  @Post('cases/:caseId/invoices/:invoiceId/payments')
  payment(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Param('invoiceId') invoiceId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
    @Body()
    body: {
      amount: number | string;
      payment_reference: string;
      payment_date: string;
    },
  ) {
    return this.procurements.postPayment(
      req.user,
      caseId,
      invoiceId,
      this.revision(revision),
      body,
      key,
    );
  }

  @Post('cases/:caseId/adjustments')
  adjustment(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Headers('if-match') revision: string,
    @Body()
    body: {
      adjustment_type: 'ADDITIONAL_CHARGE' | 'CREDIT_NOTE' | 'REFUND';
      amount: number | string;
      order_id?: string;
      invoice_id?: string;
      return_id?: string;
      reference_number?: string;
    },
  ) {
    return this.procurements.enterAdjustment(
      req.user,
      caseId,
      this.revision(revision),
      body,
    );
  }

  @Post('cases/:caseId/adjustments/:adjustmentId/post')
  postAdjustment(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Param('adjustmentId') adjustmentId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.procurements.postAdjustment(
      req.user,
      caseId,
      adjustmentId,
      this.revision(revision),
      key,
    );
  }

  @Post('cases/:caseId/returns')
  createReturn(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Headers('if-match') revision: string,
    @Body() body: CreateReturnInput,
  ) {
    return this.procurements.createReturn(
      req.user,
      caseId,
      this.revision(revision),
      body,
    );
  }

  @Post('cases/:caseId/returns/:returnId/transition')
  transitionReturn(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Param('returnId') returnId: string,
    @Headers('if-match') revision: string,
    @Body('status')
    status:
      | 'APPROVED'
      | 'SHIPPED'
      | 'VENDOR_RECEIVED'
      | 'RESOLVED'
      | 'REJECTED'
      | 'CANCELLED',
  ) {
    return this.procurements.transitionReturn(
      req.user,
      caseId,
      returnId,
      this.revision(revision),
      status,
    );
  }

  @Post('cases/:caseId/repairs')
  repair(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Headers('if-match') revision: string,
    @Body() body: { receipt_line_id: string; quantity: number; notes?: string },
  ) {
    return this.procurements.recordRepair(
      req.user,
      caseId,
      this.revision(revision),
      body,
    );
  }

  @Post('cases/:caseId/downstream-status')
  downstream(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Body() body: DownstreamStatusInput,
  ) {
    return this.procurements.recordDownstreamStatus(req.user, caseId, body);
  }

  @Post('cases/:caseId/finalize')
  finalize(
    @Req() req: { user: ProcurementActor },
    @Param('caseId') caseId: string,
    @Headers('if-match') revision: string,
    @Headers('idempotency-key') key: string,
  ) {
    return this.procurements.finalize(
      req.user,
      caseId,
      this.revision(revision),
      key,
    );
  }
}
