import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RegistrarService } from './registrar.service';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  name?: string;
};

@Controller('api/admin/registrar-desk')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('CampusAdmin', 'SuperAdmin', 'Registrar')
export class RegistrarController {
  constructor(private readonly registrar: RegistrarService) {}

  private tenant(req: { user: AuthUser }) {
    if (!req.user.tenant_id) throw new BadRequestException('Tenant context required');
    return req.user.tenant_id;
  }

  // Placement
  @Get('placement/students')
  placementStudents(
    @Req() req: { user: AuthUser },
    @Query('q') q?: string,
    @Query('department') department?: string,
    @Query('program') program?: string,
    @Query('semester') semester?: string,
    @Query('section') section?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.registrar.listPlacementStudents(this.tenant(req), {
      q,
      department,
      program,
      semester,
      section,
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post('placement/assign')
  assignPlacement(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.registrar.assignPlacement(this.tenant(req), req.user.user_id, body as any);
  }

  @Post('placement/bulk')
  bulkPlacement(
    @Req() req: { user: AuthUser },
    @Body() body: { rows: Array<Record<string, unknown>> },
  ) {
    return this.registrar.bulkAssignPlacement(
      this.tenant(req),
      req.user.user_id,
      (body.rows ?? []) as any,
    );
  }

  @Get('placement/history')
  placementHistory(
    @Req() req: { user: AuthUser },
    @Query('student_user_id') studentUserId?: string,
  ) {
    return this.registrar.placementHistory(this.tenant(req), studentUserId);
  }

  // Lifecycle
  @Post('lifecycle/:studentUserId')
  changeLifecycle(
    @Req() req: { user: AuthUser },
    @Param('studentUserId') studentUserId: string,
    @Body() body: { status: string; remarks?: string },
  ) {
    return this.registrar.changeLifecycle(
      this.tenant(req),
      req.user.user_id,
      studentUserId,
      body.status,
      body.remarks,
    );
  }

  @Get('lifecycle/:studentUserId/history')
  lifecycleHistory(
    @Req() req: { user: AuthUser },
    @Param('studentUserId') studentUserId: string,
  ) {
    return this.registrar.lifecycleHistory(this.tenant(req), studentUserId);
  }

  // Semester registration
  @Get('registrations')
  registrations(
    @Req() req: { user: AuthUser },
    @Query('status') status?: string,
    @Query('semester') semester?: string,
    @Query('department') department?: string,
    @Query('program') program?: string,
    @Query('q') q?: string,
  ) {
    return this.registrar.listSemesterRegistrations(this.tenant(req), {
      status,
      semester: semester ? Number(semester) : undefined,
      department,
      program,
      q,
    });
  }

  @Post('registrations/:id/review')
  reviewRegistration(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { status: 'APPROVED' | 'REJECTED' | 'SENT_BACK'; remarks?: string },
  ) {
    return this.registrar.reviewSemesterRegistration(
      this.tenant(req),
      req.user.user_id,
      id,
      body.status,
      body.remarks,
    );
  }

  // Certificates
  @Get('certificates')
  certificates(
    @Req() req: { user: AuthUser },
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.registrar.listCertificates(this.tenant(req), { type, status, q });
  }

  @Post('certificates')
  createCertificate(
    @Req() req: { user: AuthUser },
    @Body() body: { student_user_id: string; certificate_type: string; remarks?: string },
  ) {
    return this.registrar.createCertificate(this.tenant(req), body);
  }

  @Post('certificates/:id/:action')
  certificateAction(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() body: { remarks?: string },
  ) {
    const normalized = action.toUpperCase();
    if (!['GENERATE', 'SIGN', 'ISSUE', 'REJECT'].includes(normalized)) {
      throw new BadRequestException('Invalid certificate action');
    }
    return this.registrar.transitionCertificate(
      this.tenant(req),
      req.user.user_id,
      id,
      normalized as 'GENERATE' | 'SIGN' | 'ISSUE' | 'REJECT',
      body.remarks,
    );
  }

  // Reports
  @Get('reports/summary')
  reports(@Req() req: { user: AuthUser }) {
    return this.registrar.reportsSummary(this.tenant(req));
  }

  @Get('reports/export')
  async reportsExport(
    @Req() req: { user: AuthUser },
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ) {
    const normalized = String(format ?? 'csv').toLowerCase() === 'pdf' ? 'pdf' : 'csv';
    const { buffer, filename, contentType } = await this.registrar.reportsExportBuffer(
      this.tenant(req),
      normalized,
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  }

  @Get('activity')
  recentActivity(
    @Req() req: { user: AuthUser },
    @Query('limit') limit?: string,
  ) {
    return this.registrar.listRecentActivity(
      this.tenant(req),
      limit ? Number(limit) : 25,
    );
  }

  // Legal
  @Get('legal/rti')
  rti(@Req() req: { user: AuthUser }) {
    return this.registrar.listRti(this.tenant(req));
  }

  @Post('legal/rti')
  saveRti(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.registrar.upsertRti(this.tenant(req), req.user.user_id, body as any);
  }

  @Get('legal/court')
  court(@Req() req: { user: AuthUser }) {
    return this.registrar.listCourt(this.tenant(req));
  }

  @Post('legal/court')
  saveCourt(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.registrar.upsertCourt(this.tenant(req), body as any);
  }

  @Get('legal/notices')
  notices(@Req() req: { user: AuthUser }) {
    return this.registrar.listNotices(this.tenant(req));
  }

  @Post('legal/notices')
  saveNotice(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.registrar.upsertNotice(this.tenant(req), body as any);
  }

  @Get('legal/disciplinary')
  disciplinary(@Req() req: { user: AuthUser }) {
    return this.registrar.listDisciplinary(this.tenant(req));
  }

  @Post('legal/disciplinary')
  saveDisciplinary(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.registrar.upsertDisciplinary(this.tenant(req), body as any);
  }

  @Get('legal/compliance')
  compliance(@Req() req: { user: AuthUser }) {
    return this.registrar.legalCompliance(this.tenant(req));
  }

  // Staff appointments
  @Get('appointments')
  appointments(@Req() req: { user: AuthUser }) {
    return this.registrar.listAppointments(this.tenant(req));
  }

  @Post('appointments')
  saveAppointment(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.registrar.upsertAppointment(this.tenant(req), body as any);
  }

  @Post('appointments/:id/:action')
  appointmentAction(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() body: { remarks?: string },
  ) {
    const normalized = action.toUpperCase();
    if (!['VERIFY', 'APPROVE', 'REJECT', 'SIGN_ISSUE'].includes(normalized)) {
      throw new BadRequestException('Invalid appointment action');
    }
    return this.registrar.appointmentAction(
      this.tenant(req),
      req.user.user_id,
      req.user.name ?? 'Registrar',
      id,
      normalized as 'VERIFY' | 'APPROVE' | 'REJECT' | 'SIGN_ISSUE',
      body.remarks,
    );
  }

  @Get('appointments/activity')
  appointmentActivity(@Req() req: { user: AuthUser }) {
    return this.registrar.listAppointmentActivity(this.tenant(req));
  }

  @Get('appointments/:id/pdf')
  async appointmentLetterPdf(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.registrar.getAppointmentLetterPdfBuffer(
      this.tenant(req),
      id,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  }

  // Student records
  @Get('students/:userId')
  studentRecord(
    @Req() req: { user: AuthUser },
    @Param('userId') userId: string,
  ) {
    return this.registrar.getStudentRecord(this.tenant(req), userId);
  }

  @Patch('students/:userId')
  updateStudentRecord(
    @Req() req: { user: AuthUser },
    @Param('userId') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.registrar.updateStudentRecord(
      this.tenant(req),
      req.user.user_id,
      userId,
      body as Parameters<RegistrarService['updateStudentRecord']>[3],
    );
  }

  @Get('students/:userId/documents')
  studentDocuments(
    @Req() req: { user: AuthUser },
    @Param('userId') userId: string,
  ) {
    return this.registrar.listStudentDocuments(this.tenant(req), userId);
  }

  @Post('students/:userId/documents')
  addStudentDocument(
    @Req() req: { user: AuthUser },
    @Param('userId') userId: string,
    @Body() body: { category?: string; title: string; file_url: string },
  ) {
    return this.registrar.addStudentDocument(this.tenant(req), userId, body);
  }

  // Governance
  @Get('governance')
  governance(
    @Req() req: { user: AuthUser },
    @Query('category') category?: string,
    @Query('status') status?: string,
  ) {
    return this.registrar.listGovernance(this.tenant(req), category, status);
  }

  @Post('governance')
  saveGovernance(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.registrar.upsertGovernance(this.tenant(req), req.user.user_id, body as any);
  }

  @Post('governance/:id/decide')
  decideGovernance(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { status: 'APPROVED' | 'REJECTED'; decision_remarks?: string },
  ) {
    return this.registrar.decideGovernance(
      this.tenant(req),
      req.user.user_id,
      id,
      body.status,
      body.decision_remarks,
    );
  }

  // DSC
  @Get('dsc')
  dsc(@Req() req: { user: AuthUser }) {
    return this.registrar.getDsc(
      this.tenant(req),
      req.user.user_id,
      req.user.name ?? 'Registrar',
    );
  }

  @Patch('dsc/signature')
  dscSignature(
    @Req() req: { user: AuthUser },
    @Body() body: { signature_image_url: string | null },
  ) {
    return this.registrar.updateSignatureImage(
      this.tenant(req),
      req.user.user_id,
      body.signature_image_url,
    );
  }

  /** IT Admin / Campus Admin only — register real DSC metadata (no private keys). */
  @Patch('dsc/configure')
  @Roles('CampusAdmin', 'SuperAdmin')
  dscConfigure(
    @Req() req: { user: AuthUser },
    @Body()
    body: {
      certificate_name: string;
      certificate_authority?: string;
      serial_number: string;
      valid_from?: string;
      expiry_date: string;
      issued_by?: string;
      owner_user_id?: string;
      owner_name?: string;
    },
  ) {
    return this.registrar.configureDsc(
      this.tenant(req),
      body.owner_user_id || req.user.user_id,
      body,
    );
  }

  @Post('dsc/renew')
  dscRenew(@Req() req: { user: AuthUser }, @Body() body: { notes?: string }) {
    return this.registrar.requestDscRenewal(
      this.tenant(req),
      req.user.user_id,
      body.notes ?? '',
    );
  }

  @Get('dsc/sign-queue')
  dscSignQueue(@Req() req: { user: AuthUser }) {
    return this.registrar.listSignQueue(this.tenant(req));
  }

  @Post('dsc/bulk-sign')
  dscBulkSign(
    @Req() req: { user: AuthUser },
    @Body() body: { queue?: 'certificates' | 'appointments' | 'all'; document_label?: string },
  ) {
    const queue =
      body.queue ??
      (String(body.document_label ?? '').toLowerCase().includes('appointment')
        ? 'appointments'
        : 'certificates');
    return this.registrar.recordBulkSign(
      this.tenant(req),
      req.user.user_id,
      req.user.name ?? 'Registrar',
      queue,
    );
  }

  // Enrollment
  @Get('enrollment/queue')
  enrollmentQueue(
    @Req() req: { user: AuthUser },
    @Query('q') q?: string,
    @Query('status') status?: string,
  ) {
    return this.registrar.listEnrollmentQueue(this.tenant(req), { q, status });
  }

  @Get('enrollment/rules')
  enrollmentRules(@Req() req: { user: AuthUser }) {
    return this.registrar.listEnrollmentRules(this.tenant(req));
  }

  @Post('enrollment/enroll')
  enrollCandidate(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.registrar.enrollCandidate(
      this.tenant(req),
      req.user.user_id,
      body as Parameters<RegistrarService['enrollCandidate']>[2],
    );
  }

  @Get('enrollment/history')
  enrollmentHistory(
    @Req() req: { user: AuthUser },
    @Query('q') q?: string,
  ) {
    return this.registrar.listEnrollmentHistory(this.tenant(req), { q });
  }

  // Petitions
  @Get('petitions')
  petitions(
    @Req() req: { user: AuthUser },
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('q') q?: string,
  ) {
    return this.registrar.listPetitions(this.tenant(req), { status, type, q });
  }

  @Post('petitions')
  createPetition(@Req() req: { user: AuthUser }, @Body() body: Record<string, unknown>) {
    return this.registrar.createPetition(
      this.tenant(req),
      req.user.user_id,
      body as Parameters<RegistrarService['createPetition']>[2],
    );
  }

  @Post('petitions/:id/decide')
  decidePetition(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { status: 'APPROVED' | 'REJECTED' | 'ISSUED'; remarks?: string },
  ) {
    return this.registrar.decidePetition(
      this.tenant(req),
      req.user.user_id,
      id,
      body.status,
      body.remarks,
    );
  }

  // Dashboard & analytics
  @Get('dashboard/kpis')
  dashboardKpis(@Req() req: { user: AuthUser }) {
    return this.registrar.dashboardKpis(this.tenant(req));
  }

  @Get('degree-eligibility')
  degreeEligibility(
    @Req() req: { user: AuthUser },
    @Query('q') q?: string,
  ) {
    return this.registrar.listDegreeEligibility(this.tenant(req), q);
  }

  @Post('degree-eligibility/:id/decide')
  decideDegreeEligibility(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { decision: 'APPROVED' | 'REJECTED'; remarks?: string },
  ) {
    return this.registrar.decideDegreeEligibility(
      this.tenant(req),
      req.user.user_id,
      id,
      body.decision,
      body.remarks,
    );
  }

  @Get('degree-eligibility/:id/history')
  degreeEligibilityHistory(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
  ) {
    return this.registrar.degreeApprovalHistory(this.tenant(req), id);
  }

  @Get('certificates/:id/pdf')
  async certificatePdf(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.registrar.getCertificatePdfBuffer(
      this.tenant(req),
      id,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  }

  @Get('workflow/:studentUserId')
  workflowStatus(
    @Req() req: { user: AuthUser },
    @Param('studentUserId') studentUserId: string,
  ) {
    return this.registrar.getWorkflowStatus(this.tenant(req), studentUserId);
  }
}
