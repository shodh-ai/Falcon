import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../../entities/lead.entity';
import { Application } from '../../entities/application.entity';
import { DocumentVerification } from '../../entities/document-verification.entity';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';

@Injectable()
export class AdmissionsService {
  constructor(
    @InjectRepository(Lead) private leads: Repository<Lead>,
    @InjectRepository(Application) private applications: Repository<Application>,
    @InjectRepository(DocumentVerification) private docs: Repository<DocumentVerification>,
  ) {}

  listLeads(stage?: string) {
    if (stage) {
      return this.leads.find({ where: { stage: stage as Lead['stage'] }, order: { created_at: 'DESC' } });
    }
    return this.leads.find({ order: { created_at: 'DESC' } });
  }

  createLead(dto: CreateLeadDto) {
    return this.leads.save(this.leads.create(dto));
  }

  async updateLeadStage(leadId: string, dto: UpdateLeadStageDto) {
    const lead = await this.leads.findOne({ where: { lead_id: leadId } });
    if (!lead) throw new NotFoundException('Lead not found');
    lead.stage = dto.stage;
    return this.leads.save(lead);
  }

  listApplications() {
    return this.applications.find({ order: { created_at: 'DESC' } });
  }

  listDocumentsForApplication(applicationId: string) {
    return this.docs.find({ where: { application_id: applicationId }, order: { created_at: 'DESC' } });
  }
}
