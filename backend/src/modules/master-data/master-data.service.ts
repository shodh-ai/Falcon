import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IdGeneratorService } from '../../core/id-generator/id-generator.service';

@Injectable()
export class MasterDataService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly idGen: IdGeneratorService,
  ) {}

  async listCountries(tenantId: string) {
    return this.dataSource.query(
      `SELECT * FROM master_countries WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenantId],
    );
  }

  async createCountry(tenantId: string, name: string, code?: string) {
    const rows = await this.dataSource.query(
      `INSERT INTO master_countries (tenant_id, name, code) VALUES ($1,$2,$3) RETURNING *`,
      [tenantId, name.trim(), code?.trim() ?? null],
    );
    return rows[0];
  }

  async listStates(tenantId: string, countryId?: number) {
    if (countryId) {
      return this.dataSource.query(
        `SELECT * FROM master_states WHERE tenant_id = $1 AND country_id = $2 ORDER BY name ASC`,
        [tenantId, countryId],
      );
    }
    return this.dataSource.query(
      `SELECT s.*, c.name AS country_name FROM master_states s
       INNER JOIN master_countries c ON c.country_id = s.country_id
       WHERE s.tenant_id = $1 ORDER BY c.name, s.name`,
      [tenantId],
    );
  }

  async createState(
    tenantId: string,
    countryId: number,
    name: string,
    code?: string,
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO master_states (tenant_id, country_id, name, code) VALUES ($1,$2,$3,$4) RETURNING *`,
      [tenantId, countryId, name.trim(), code?.trim() ?? null],
    );
    return rows[0];
  }

  async listCities(tenantId: string, stateId?: number) {
    if (stateId) {
      return this.dataSource.query(
        `SELECT * FROM master_cities WHERE tenant_id = $1 AND state_id = $2 ORDER BY name ASC`,
        [tenantId, stateId],
      );
    }
    return this.dataSource.query(
      `SELECT ci.*, s.name AS state_name FROM master_cities ci
       INNER JOIN master_states s ON s.state_id = ci.state_id
       WHERE ci.tenant_id = $1 ORDER BY s.name, ci.name`,
      [tenantId],
    );
  }

  async createCity(tenantId: string, stateId: number, name: string) {
    const rows = await this.dataSource.query(
      `INSERT INTO master_cities (tenant_id, state_id, name) VALUES ($1,$2,$3) RETURNING *`,
      [tenantId, stateId, name.trim()],
    );
    return rows[0];
  }

  async listCastes(tenantId: string) {
    return this.dataSource.query(
      `SELECT * FROM master_castes WHERE tenant_id = $1 ORDER BY name`,
      [tenantId],
    );
  }

  async createCaste(tenantId: string, name: string) {
    const rows = await this.dataSource.query(
      `INSERT INTO master_castes (tenant_id, name) VALUES ($1,$2) RETURNING *`,
      [tenantId, name.trim()],
    );
    return rows[0];
  }

  async listCategories(tenantId: string) {
    return this.dataSource.query(
      `SELECT * FROM master_categories WHERE tenant_id = $1 ORDER BY name`,
      [tenantId],
    );
  }

  async createCategory(tenantId: string, name: string) {
    const rows = await this.dataSource.query(
      `INSERT INTO master_categories (tenant_id, name) VALUES ($1,$2) RETURNING *`,
      [tenantId, name.trim()],
    );
    return rows[0];
  }

  async listReligions(tenantId: string) {
    return this.dataSource.query(
      `SELECT * FROM master_religions WHERE tenant_id = $1 ORDER BY name`,
      [tenantId],
    );
  }

  async createReligion(tenantId: string, name: string) {
    const rows = await this.dataSource.query(
      `INSERT INTO master_religions (tenant_id, name) VALUES ($1,$2) RETURNING *`,
      [tenantId, name.trim()],
    );
    return rows[0];
  }

  async listEnrollmentRules(tenantId: string) {
    return this.dataSource.query(
      `SELECT * FROM enrollment_id_rules WHERE tenant_id = $1 ORDER BY rule_name`,
      [tenantId],
    );
  }

  async createEnrollmentRule(
    tenantId: string,
    dto: { rule_name: string; template: string; seq_padding?: number },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO enrollment_id_rules (tenant_id, rule_name, template, seq_padding)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [
        tenantId,
        dto.rule_name.trim(),
        dto.template.trim(),
        dto.seq_padding ?? 3,
      ],
    );
    return rows[0];
  }

  async generateEnrollmentId(
    tenantId: string,
    ruleId: string,
    context: Record<string, string | number>,
  ) {
    const rules = await this.dataSource.query(
      `SELECT * FROM enrollment_id_rules WHERE rule_id = $1 AND tenant_id = $2 AND is_active = true`,
      [ruleId, tenantId],
    );
    const rule = rules[0];
    if (!rule) throw new BadRequestException('Enrollment rule not found');

    const contextKey = Object.entries(context)
      .map(([k, v]) => `${k}=${v}`)
      .join('|');
    const counter = await this.dataSource.query(
      `INSERT INTO enrollment_id_counters (tenant_id, rule_id, context_key, last_seq)
       VALUES ($1,$2,$3,1)
       ON CONFLICT (tenant_id, rule_id, context_key)
       DO UPDATE SET last_seq = enrollment_id_counters.last_seq + 1
       RETURNING last_seq`,
      [tenantId, ruleId, contextKey],
    );
    const seq = counter[0].last_seq;
    const id = this.idGen.format(
      rule.template,
      { ...context, SEQ: seq },
      rule.seq_padding,
    );
    return { enrollment_id: id, seq };
  }

  async getTodayBirthdays(tenantId: string) {
    return this.dataSource.query(
      `SELECT u.user_id, u.name, r.role_name, sp.date_of_birth
       FROM users u
       INNER JOIN roles r ON r.role_id = u.role_id
       INNER JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.tenant_id = $1 AND u.is_active = true
         AND sp.date_of_birth IS NOT NULL
         AND EXTRACT(MONTH FROM sp.date_of_birth) = EXTRACT(MONTH FROM CURRENT_DATE)
         AND EXTRACT(DAY FROM sp.date_of_birth) = EXTRACT(DAY FROM CURRENT_DATE)
       ORDER BY u.name ASC`,
      [tenantId],
    );
  }

  /** Faculty (under the requesting HOD's department) whose birthday is today. */
  async getDepartmentFacultyBirthdays(tenantId: string, hodUserId: string) {
    return this.dataSource.query(
      `SELECT u.user_id, u.name, r.role_name,
              (u.onboarding_profile->>'date_of_birth')::date AS date_of_birth
       FROM users u
       INNER JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.is_active = true
         AND r.role_name = 'Faculty'
         AND u.dept_id IN (
           SELECT dept_id FROM departments WHERE tenant_id = $1 AND hod_user_id = $2
           UNION
           SELECT dept_id FROM users WHERE tenant_id = $1 AND user_id = $2
         )
         AND u.onboarding_profile->>'date_of_birth' ~ '^\\d{4}-\\d{2}-\\d{2}'
         AND EXTRACT(MONTH FROM (u.onboarding_profile->>'date_of_birth')::date) = EXTRACT(MONTH FROM CURRENT_DATE)
         AND EXTRACT(DAY FROM (u.onboarding_profile->>'date_of_birth')::date) = EXTRACT(DAY FROM CURRENT_DATE)
       ORDER BY u.name ASC`,
      [tenantId, hodUserId],
    );
  }
}
