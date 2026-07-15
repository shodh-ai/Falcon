import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Lead } from '../../entities/lead.entity';
import { Application } from '../../entities/application.entity';
import { DocumentVerification } from '../../entities/document-verification.entity';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';
import { LeadScoringService } from './lead-scoring.service';

@Injectable()
export class AdmissionsService {
  constructor(
    @InjectRepository(Lead) private leads: Repository<Lead>,
    @InjectRepository(Application)
    private applications: Repository<Application>,
    @InjectRepository(DocumentVerification)
    private docs: Repository<DocumentVerification>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scoring: LeadScoringService,
  ) {}

  listLeads(stage?: string, tenantId?: string) {
    const where: Record<string, unknown> = {};
    if (stage) where.stage = stage;
    if (tenantId) where.tenant_id = tenantId;
    return this.leads.find({
      where,
      order: { lead_score: 'DESC', created_at: 'DESC' },
    });
  }

  createLead(dto: CreateLeadDto, tenantId?: string) {
    return this.leads.save(
      this.leads.create({
        ...dto,
        tenant_id: tenantId ?? null,
        stage: (dto.stage as Lead['stage']) ?? 'RAW_LEAD',
      }),
    );
  }

  async updateLeadStage(leadId: string, dto: UpdateLeadStageDto) {
    const lead = await this.leads.findOne({ where: { lead_id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    lead.stage = dto.stage;
    const saved = await this.leads.save(lead);
    await this.scoring.scoreLead(leadId);
    return saved;
  }

  async getLeadTimeline(leadId: string) {
    return this.dataSource.query(
      `SELECT * FROM admissions_lead_activities WHERE lead_id = $1 ORDER BY created_at DESC`,
      [leadId],
    );
  }

  async logLeadActivity(
    tenantId: string,
    leadId: string,
    dto: {
      channel: string;
      direction?: string;
      subject?: string;
      body?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO admissions_lead_activities (tenant_id, lead_id, channel, direction, subject, body, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        tenantId,
        leadId,
        dto.channel,
        dto.direction ?? 'OUTBOUND',
        dto.subject ?? null,
        dto.body ?? null,
        JSON.stringify(dto.metadata ?? {}),
      ],
    );
    await this.scoring.scoreLead(leadId);
    return rows[0];
  }

  async uploadLeadDocument(
    tenantId: string,
    leadId: string,
    dto: { title: string; file_path: string },
  ) {
    const lead = await this.leads.findOne({ where: { lead_id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (!lead.email)
      throw new NotFoundException(
        'Lead has no email to link to student account',
      );

    const users = await this.dataSource.query(
      'SELECT user_id FROM users WHERE official_email = $1 OR personal_email = $1',
      [lead.email],
    );
    if (users.length === 0)
      throw new NotFoundException(
        'No enrolled student found for this lead email',
      );

    const userId = users[0].user_id;

    await this.dataSource.query(
      `INSERT INTO student_certificates (certificate_id, tenant_id, student_user_id, title, issuer, file_path, verification_status)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Admissions Office', $4, 'VERIFIED')`,
      [tenantId, userId, dto.title, dto.file_path],
    );

    await this.logLeadActivity(tenantId, leadId, {
      channel: 'SYSTEM',
      subject: `Uploaded Admission Document: ${dto.title}`,
    });

    return { success: true };
  }

  kanbanBoard(tenantId?: string) {
    const stages = [
      'RAW_LEAD',
      'CONTACTED',
      'APPLICATION_STARTED',
      'FEE_PAID',
      'ENROLLED',
    ];
    return Promise.all(
      stages.map(async (stage) => ({
        stage,
        leads: await this.listLeads(stage, tenantId),
      })),
    );
  }

  listApplications() {
    return this.applications.find({ order: { created_at: 'DESC' } });
  }

  listDocumentsForApplication(applicationId: string) {
    return this.docs.find({
      where: { application_id: applicationId },
      order: { created_at: 'DESC' },
    });
  }

  async getEnrolledStudents(
    tenantId: string,
    q?: string,
    year?: string,
    branch?: string,
  ) {
    const params: any[] = [tenantId];
    let queryIdx = 2;

    let whereClause = `WHERE u.tenant_id = $1 AND r.role_name = 'Student'`;

    if (q) {
      whereClause += ` AND (u.name ILIKE $${queryIdx} OR u.official_email ILIKE $${queryIdx} OR sp.enrollment_no ILIKE $${queryIdx})`;
      params.push(`%${q}%`);
      queryIdx++;
    }

    if (year) {
      whereClause += ` AND sp.batch = $${queryIdx}`;
      params.push(year);
      queryIdx++;
    }

    if (branch) {
      if (branch.startsWith('name:')) {
        const branchName = branch.slice(5);
        whereClause += ` AND (
          lower(trim(d.dept_name)) = lower($${queryIdx})
          OR lower(trim(sp.batch)) = lower($${queryIdx})
        )`;
        params.push(branchName);
      } else {
        whereClause += ` AND d.dept_id = $${queryIdx}`;
        params.push(Number(branch));
      }
      queryIdx++;
    }

    const students = await this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email as email, sp.enrollment_no, sp.batch,
              d.dept_id, d.dept_name,
              COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'transaction_id', t.transaction_id,
                      'amount', t.amount,
                      'status', t.status,
                      'receipt_url', t.receipt_url,
                      'fee_head', fd.fee_head
                    )
                  )
                  FROM finance_transactions t
                  LEFT JOIN finance_fee_demands fd ON fd.demand_id = t.demand_id
                  WHERE t.student_user_id = u.user_id AND t.status = 'SUCCESS'
                ), '[]'::json
              ) as transactions,
              COALESCE(
                (
                  SELECT json_agg(doc_row)
                  FROM (
                    SELECT c.title, c.file_path, c.uploaded_at
                    FROM student_certificates c
                    WHERE c.student_user_id = u.user_id
                    UNION ALL
                    SELECT 
                      CASE 
                        WHEN o.doc_type = '10TH_MARKSHEET' THEN '10th Marksheet'
                        WHEN o.doc_type = '12TH_MARKSHEET' THEN '12th Marksheet'
                        WHEN o.doc_type = 'AADHAAR' THEN 'Aadhar Card'
                        WHEN o.doc_type = 'PAN' THEN 'PAN Card'
                        WHEN o.doc_type = 'PHOTO' THEN 'Photograph'
                        ELSE o.doc_type
                      END as title,
                      o.file_path,
                      o.uploaded_at
                    FROM student_onboarding_docs o
                    WHERE o.student_user_id = u.user_id AND o.status = 'APPROVED'
                  ) as doc_row
                ), '[]'::json
              ) as documents
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       ${whereClause}
       ORDER BY u.name ASC
       LIMIT 100`,
      params,
    );

    return students;
  }

  async getEnrolledStudentBranches(tenantId: string) {
    return this.dataSource.query<
      { branch_key: string; dept_id: number | null; dept_name: string }[]
    >(
      `SELECT DISTINCT
         COALESCE(d.dept_id::text, 'name:' || COALESCE(NULLIF(trim(d.dept_name), ''), trim(sp.batch))) AS branch_key,
         d.dept_id,
         COALESCE(NULLIF(trim(d.dept_name), ''), NULLIF(trim(sp.batch), ''), 'Unassigned') AS dept_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1
         AND r.role_name = 'Student'
         AND (
           d.dept_id IS NOT NULL
           OR NULLIF(trim(sp.batch), '') IS NOT NULL
           OR NULLIF(trim(d.dept_name), '') IS NOT NULL
         )
       ORDER BY dept_name ASC`,
      [tenantId],
    );
  }

  async uploadTransactionReceipt(transactionId: string, receiptUrl: string) {
    const result = await this.dataSource.query(
      `UPDATE finance_transactions SET receipt_url = $1 WHERE transaction_id = $2`,
      [receiptUrl, transactionId],
    );
    return { success: true };
  }

  async uploadEnrolledStudentDocument(
    tenantId: string,
    userId: string,
    dto: { title: string; file_path: string },
  ) {
    await this.dataSource.query(
      `INSERT INTO student_certificates (certificate_id, tenant_id, student_user_id, title, issuer, file_path, verification_status)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Admissions Office', $4, 'VERIFIED')`,
      [tenantId, userId, dto.title, dto.file_path],
    );
    return { success: true };
  }
}
