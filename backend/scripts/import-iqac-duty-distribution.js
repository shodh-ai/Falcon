#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { Client } = require('pg');

const DEFAULT_TENANT = 'a0000000-0000-4000-8000-000000000001';
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ROLE_ALIASES = {
  'Dean/ Principal/ Heads': ['Dean', 'HOD', 'Principal'],
  'Faculty Member': ['Faculty'],
  'Lab Staff': ['LabStaff', 'Lab Staff'],
  'Registrar Office': ['Registrar'],
  'HR Office': ['HR'],
  'Placement Cell': ['PlacementCell'],
  'Admission Cell': ['AdmissionOfficer', 'Admissions'],
  Library: ['Librarian', 'Library'],
  'Academic Staff College': ['HR'],
  'International Office': ['InternationalOffice'],
  CFAO: ['CFAO', 'FinanceOfficer'],
  'Dean Academics': ['Dean'],
  'Dean Research': ['DeanResearch', 'Dean'],
  IQAC: ['IQAC'],
  'Grievance Cell': ['GrievanceOfficer'],
  'Controller of Examination': ['ControllerExaminations', 'ExamController'],
  'Sports Office': ['SportsOfficer'],
  'IT Cell': ['ITAdmin', 'Admin'],
  'Dean Student Welfare/ SWB': ['DeanStudentWelfare', 'Dean'],
  'Mission 20 Point Coordinator': ['IQAC'],
  'Head, MoU & Collaboration cell': ['ResearchAdmin', 'IQAC'],
  'Coordinator, Alumni Cell': ['AlumniOfficer', 'PlacementCell'],
  'Coordinator, Entrepreneurship Cell': ['InnovationOfficer', 'ResearchAdmin'],
};

const SOURCE_MODULES = {
  'Dean/ Principal/ Heads': 'sis_academics',
  'Faculty Member': 'lms_learning',
  'Lab Staff': 'inventory_assets',
  'Registrar Office': 'campus_operations',
  'HR Office': 'hrms_ess',
  'Placement Cell': 'placements_alumni',
  'Admission Cell': 'admissions_onboarding',
  Library: 'library',
  'Academic Staff College': 'hrms_ess',
  'International Office': 'research_innovation',
  CFAO: 'finance_procurement',
  'Dean Academics': 'sis_academics',
  'Dean Research': 'research_innovation',
  IQAC: 'iqac_compliance',
  'Grievance Cell': 'helpdesk_esm',
  'Controller of Examination': 'examinations_credentials',
  'Sports Office': 'campus_operations',
  'IT Cell': 'helpdesk_esm',
  'Dean Student Welfare/ SWB': 'campus_operations',
  'Mission 20 Point Coordinator': 'iqac_compliance',
  'Head, MoU & Collaboration cell': 'research_innovation',
};

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function normalize(value) {
  return String(value ?? '').replace(/\r/g, '').trim();
}

function taskRows(workbook, sourceHash, academicYear) {
  const rows = [];
  const sources = [
    { sheet: 'School Department Centre', ownerColumn: 2, monthStart: 3 },
    { sheet: 'Offices', ownerColumn: 1, monthStart: 2 },
  ];
  for (const source of sources) {
    const sheet = workbook.getWorksheet(source.sheet);
    if (!sheet) throw new Error(`Required sheet missing: ${source.sheet}`);
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const owner = normalize(sheet.getCell(rowNumber, source.ownerColumn).value);
      if (!owner) continue;
      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        const description = normalize(
          sheet.getCell(rowNumber, source.monthStart + monthIndex).value,
        );
        if (!description) continue;
        const month = MONTHS[monthIndex];
        rows.push({
          owner,
          month,
          description,
          academicYear,
          sourceReference: `${path.basename(sourceFile)}#${source.sheet}!R${rowNumber}C${source.monthStart + monthIndex}`,
          sourceHash,
          roleAliases: ROLE_ALIASES[owner] ?? [],
          sourceModule: SOURCE_MODULES[owner] ?? 'iqac_compliance',
        });
      }
    }
  }
  return rows;
}

async function resolveRoleAndAssignee(client, tenantId, row) {
  for (const roleName of row.roleAliases) {
    const roles = await client.query(
      `SELECT role_id FROM roles WHERE LOWER(role_name) = LOWER($1) ORDER BY role_id LIMIT 1`,
      [roleName],
    );
    if (!roles.rows[0]) continue;
    const roleId = Number(roles.rows[0].role_id);
    const users = await client.query(
      `SELECT user_id FROM users
       WHERE tenant_id = $1 AND role_id = $2 AND is_active = TRUE AND deleted_at IS NULL
       ORDER BY user_id`,
      [tenantId, roleId],
    );
    return {
      roleId,
      defaultAssigneeId: users.rowCount === 1 ? users.rows[0].user_id : null,
      resolution: users.rowCount === 1 ? 'EXACT_USER' : users.rowCount > 1 ? 'ROLE_MULTIPLE_USERS' : 'ROLE_NO_ACTIVE_USER',
    };
  }
  return { roleId: null, defaultAssigneeId: null, resolution: 'ROLE_UNRESOLVED' };
}

async function applyRows(rows, tenantId) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required with --apply');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const summary = { inserted: 0, updated: 0, unresolved: [] };
  try {
    await client.query('BEGIN');
    for (const row of rows) {
      const match = await resolveRoleAndAssignee(client, tenantId, row);
      const existing = await client.query(
        `SELECT task_id FROM task_master
         WHERE tenant_id = $1 AND source_reference = $2 AND deleted_at IS NULL`,
        [tenantId, row.sourceReference],
      );
      const values = [
        `${row.owner} — ${row.month} duties`, row.description, match.roleId,
        row.month, tenantId, row.academicYear, row.owner, match.defaultAssigneeId,
        'MONTH_END', JSON.stringify(['SYSTEM_REPORT_OR_DOCUMENT', 'APPROVAL_OR_MINUTES_WHERE_APPLICABLE', 'GEOTAGGED_PHOTO_WHERE_APPLICABLE']),
        row.sourceModule, row.sourceReference, row.sourceHash,
      ];
      if (existing.rows[0]) {
        await client.query(
          `UPDATE task_master SET task_name=$1, task_description=$2, role_id=$3,
             month=$4, academic_year=$6, owner_label=$7, default_assignee_id=$8,
             due_date_policy=$9, evidence_requirements=$10::jsonb, source_module=$11,
             source_reference=$12, source_hash=$13, version=version+1, updated_at=NOW()
           WHERE task_id=$14`,
          [...values, existing.rows[0].task_id],
        );
        summary.updated += 1;
      } else {
        await client.query(
          `INSERT INTO task_master
             (task_name, task_description, role_id, month, tenant_id, academic_year,
              owner_label, default_assignee_id, due_date_policy, evidence_requirements,
              source_module, source_reference, source_hash, is_recurring, version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,TRUE,1)`,
          values,
        );
        summary.inserted += 1;
      }
      if (match.resolution !== 'EXACT_USER') {
        summary.unresolved.push({ owner: row.owner, resolution: match.resolution });
      }
    }
    await client.query('COMMIT');
    return summary;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

const sourceFile = path.resolve(arg('file', '/Users/apple/Downloads/Duty Distribution CMS.xlsx'));
const academicYear = arg('academic-year', '2026-27');
const tenantId = arg('tenant', DEFAULT_TENANT);
const apply = process.argv.includes('--apply');

(async () => {
  const bytes = fs.readFileSync(sourceFile);
  const sourceHash = crypto.createHash('sha256').update(bytes).digest('hex');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const rows = taskRows(workbook, sourceHash, academicYear);
  const owners = [...new Set(rows.map((row) => row.owner))];
  const report = {
    mode: apply ? 'APPLY' : 'DRY_RUN',
    sourceFile,
    sourceHash,
    academicYear,
    tenantId,
    taskTemplateCount: rows.length,
    ownerCount: owners.length,
    owners,
    blankOwnersExcluded: ['Coordinator, Alumni Cell', 'Coordinator, Entrepreneurship Cell']
      .filter((owner) => !rows.some((row) => row.owner === owner)),
  };
  if (apply) report.database = await applyRows(rows, tenantId);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
