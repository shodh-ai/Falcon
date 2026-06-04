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
    @InjectRepository(Application) private applications: Repository<Application>,
    @InjectRepository(DocumentVerification) private docs: Repository<DocumentVerification>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scoring: LeadScoringService,
  ) {}

  listLeads(stage?: string, tenantId?: string) {
    const where: Record<string, unknown> = {};
    if (stage) where.stage = stage;
    if (tenantId) where.tenant_id = tenantId;
    return this.leads.find({ where, order: { lead_score: 'DESC', created_at: 'DESC' } });
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
    dto: { channel: string; direction?: string; subject?: string; body?: string; metadata?: Record<string, unknown> },
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

  kanbanBoard(tenantId?: string) {
    const stages = ['RAW_LEAD', 'CONTACTED', 'APPLICATION_STARTED', 'FEE_PAID', 'ENROLLED'];
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
    return this.docs.find({ where: { application_id: applicationId }, order: { created_at: 'DESC' } });
  }
}
