#!/usr/bin/env node
/**
 * Idempotent production-safe bootstrap for the Gyan Vihar Medical College
 * Finance + complete DoFA lifecycle pilot.
 *
 * Preview (no database mutation):
 *   npm run tenant:provision:gvmc-finance -- --plan
 *
 * Apply intentionally:
 *   GVMC_FINANCE_PROVISION_CONFIRM=GVMC-FINANCE-LAUNCH \
 *   npm run tenant:provision:gvmc-finance -- --apply \
 *     --credentials-out=/secure/path/gvmc-finance-credentials.json
 *
 * The output file is mode 0600 and contains temporary passwords only for newly
 * created accounts. Existing users are never assigned/reset to a known password.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Client } = require('pg');

const MODULES = [
  'admissions_onboarding',
  'sis_academics',
  'examinations_credentials',
  'hrms_ess',
  'finance_procurement',
  'inventory_assets',
  'library',
  'hostel_mess',
  'transport',
  'helpdesk_esm',
  'research_innovation',
  'placements_alumni',
  'iqac_compliance',
  'clinic_safety',
  'campus_operations',
  'leadership_reporting',
];

const ENABLED_MODULES = new Set(['finance_procurement', 'inventory_assets']);

const FEATURE_STATES = {
  dofa_module2_progressive_procurement: true,
  dofa_module3_invoice_integrity: true,
  dofa_module3_payment_gate: false,
  dofa_module4_product_verification: true,
  dofa_module4_inventory_gate: false,
  dofa_module5_inventory: true,
  dofa_module5_identity_gate: false,
  dofa_module6_consumables: true,
  dofa_module6_replenishment: true,
  dofa_module7_returns: true,
  dofa_module7_financial_recovery_gate: false,
  dofa_module8_asset_service: true,
  dofa_module8_preventive_maintenance: true,
  dofa_module8_service_gate: false,
  dofa_module9_asset_retirement: true,
  dofa_module9_disposal_gate: false,
  dofa_module9_sanitization_gate: false,
  dofa_module9_controlled_auction: false,
  dofa_module_x_physical_identity: true,
  dofa_module_x_provisioning_gate: false,
  dofa_module_x_gate_observation: true,
  dofa_module_x_retrofit: true,
};

// Eleven people cover the initial purchase-to-inventory launch. Compatible
// duties are combined, while conflicting maker-checker steps stay on distinct
// user IDs. Service and disposal operators are deferred to a later rollout.
const ACCOUNTS = [
  {
    code: 'G01',
    slug: 'requester',
    role: 'Faculty',
    name: 'GVMC Acquisition Requester',
    dept: true,
    grants: [
      'ACQUISITION_REQUESTER',
      'CONSUMABLES_VIEW',
      'CONSUMABLES_REQUEST',
      'CONSUMABLES_CONSUMPTION_RECORD',
      'RETURNS_VIEW',
      'RETURNS_INITIATE',
      'ASSET_SERVICE_VIEW',
      'ASSET_SERVICE_REQUEST',
      'ASSET_RETIREMENT_VIEW',
      'ASSET_RETIREMENT_REQUEST',
    ],
  },
  {
    code: 'G02',
    slug: 'hod',
    role: 'HOD',
    name: 'GVMC HOD Approver',
    dept: true,
    grants: [
      'ACQUISITION_REQUESTER',
      'PROCUREMENT_VIEW',
      'ASSET_SERVICE_VIEW',
      'ASSET_SERVICE_ACCEPT',
    ],
  },
  {
    code: 'G03',
    slug: 'college-approver',
    role: 'Dean',
    extraRoles: ['President', 'COO', 'Chairman'],
    name: 'GVMC College DoFA Approver',
    grants: [
      'PROCUREMENT_VIEW',
      'RETURNS_VIEW',
      'RETURNS_APPROVE',
      'ASSET_SERVICE_VIEW',
      'ASSET_SERVICE_WARRANTY_EXCEPTION',
      'ASSET_RETIREMENT_VIEW',
      'ASSET_DISPOSAL_AWARD',
    ],
  },
  {
    code: 'G04',
    slug: 'procurement-operator',
    role: 'ProcurementBuyer',
    extraRoles: ['APClerk'],
    name: 'GVMC Procurement and Invoice Operator',
    grants: [
      'ACQUISITION_VENDOR_REVIEW',
      'PROCUREMENT_VIEW',
      'PROCUREMENT_ORDER_ENTRY',
      'PROCUREMENT_INVOICE_ENTRY',
      'INVOICE_INTEGRITY_VIEW',
    ],
  },
  {
    code: 'G05',
    slug: 'procurement-review',
    role: 'ProcurementHead',
    extraRoles: ['APManager'],
    name: 'GVMC Procurement and Invoice Reviewer',
    grants: [
      'ACQUISITION_VENDOR_REVIEW',
      'PROCUREMENT_VIEW',
      'PROCUREMENT_ORDER_ENTRY',
      'PROCUREMENT_INVOICE_VERIFY',
      'INVOICE_SOURCE_RETRIEVE',
      'INVOICE_INTEGRITY_VIEW',
      'INVOICE_INTEGRITY_ANALYZE',
      'INVOICE_INTEGRITY_INVESTIGATE',
      'PRODUCT_VERIFICATION_VIEW',
      'PRODUCT_VERIFICATION_ANALYZE',
      'PRODUCT_VERIFICATION_EXCEPTION_APPROVE',
      'CONSUMABLES_VIEW',
      'CONSUMABLES_APPROVE',
      'RETURNS_VIEW',
      'RETURNS_RECONSIDER',
      'ASSET_SERVICE_VIEW',
      'ASSET_SERVICE_TRIAGE',
      'ASSET_SERVICE_ASSIGN',
      'ASSET_SERVICE_WARRANTY_REVIEW',
      'ASSET_SERVICE_ESTIMATE_APPROVE',
      'ASSET_RETIREMENT_VIEW',
      'ASSET_RETIREMENT_ASSESS',
      'ASSET_RETIREMENT_DOFA_SUBMIT',
      'ASSET_DISPOSAL_BID_MANAGE',
      'CONSUMABLES_EMERGENCY_REVIEW',
      'CONSUMABLES_REPLENISHMENT_CONVERT',
      'RETURNS_ELIGIBILITY_REVIEW',
    ],
  },
  {
    code: 'G06',
    slug: 'budget-integrity',
    role: 'FinanceController',
    name: 'GVMC Budget and Integrity Officer',
    grants: [
      'ACQUISITION_BUDGET_OVERSIGHT',
      'PROCUREMENT_VIEW',
      'INVOICE_INTEGRITY_VIEW',
      'INVOICE_INTEGRITY_CERTIFY',
    ],
  },
  {
    code: 'G07',
    slug: 'payment',
    role: 'CFO',
    name: 'GVMC Payment Officer',
    grants: [
      'PROCUREMENT_VIEW',
      'PROCUREMENT_PAYMENT_POST',
      'ASSET_RETIREMENT_VIEW',
      'ASSET_RETIREMENT_VALUATION_VIEW',
      'ASSET_RETIREMENT_RECONCILE',
    ],
  },
  {
    code: 'G08',
    slug: 'receiving-stores',
    role: 'ReceivingClerk',
    extraRoles: ['Stores'],
    name: 'GVMC Receiving and Stores Officer',
    grants: [
      'PROCUREMENT_VIEW',
      'PROCUREMENT_RECEIPT_ENTRY',
      'PRODUCT_VERIFICATION_VIEW',
      'PRODUCT_VERIFICATION_CAPTURE',
      'INVENTORY_VIEW',
      'INVENTORY_INGEST',
      'INVENTORY_IDENTITY_PREPARE',
      'INVENTORY_RFID_ENCODE',
      'INVENTORY_ASSIGN',
      'INVENTORY_TRANSFER',
      'INVENTORY_LOT_MOVEMENT',
      'PHYSICAL_IDENTITY_VIEW',
      'PHYSICAL_IDENTITY_PROVISION',
      'PHYSICAL_IDENTITY_RETROFIT',
      'CONSUMABLES_VIEW',
      'CONSUMABLES_ISSUE',
      'CONSUMABLES_EMERGENCY_ISSUE',
      'CONSUMABLES_COUNT',
      'RETURNS_VIEW',
      'RETURNS_VENDOR_COORDINATE',
      'RETURNS_SHIP',
      'ASSET_SERVICE_VIEW',
      'ASSET_SERVICE_EXECUTE',
      'ASSET_SERVICE_PARTS_MANAGE',
      'ASSET_RETIREMENT_VIEW',
      'ASSET_SANITIZATION_EXECUTE',
      'ASSET_DISPOSAL_PREPARE',
      'ASSET_DISPOSAL_EXECUTE',
      'GATE_ASSET_OBSERVE',
    ],
  },
  {
    code: 'G09',
    slug: 'inventory-verifier',
    role: 'InventoryVerifier',
    name: 'GVMC Independent Inventory Verifier',
    grants: [
      'PRODUCT_VERIFICATION_VIEW',
      'PRODUCT_VERIFICATION_REVIEW',
      'INVENTORY_VIEW',
      'INVENTORY_IDENTITY_VERIFY',
      'INVENTORY_TRANSFER',
      'PHYSICAL_IDENTITY_VIEW',
      'PHYSICAL_IDENTITY_ATTACH_VERIFY',
      'CONSUMABLES_VIEW',
      'CONSUMABLES_COUNT_APPROVE',
      'ASSET_RETIREMENT_VIEW',
      'ASSET_SANITIZATION_VERIFY',
      'ASSET_DISPOSAL_ACCEPT',
      'PHYSICAL_IDENTITY_RECONCILE',
      'GATE_ASSET_REVIEW',
    ],
  },
  {
    code: 'G10',
    slug: 'auditor',
    role: 'InternalAuditor',
    name: 'GVMC Internal Auditor',
    grants: [
      'ACQUISITION_AUDIT_OVERSIGHT',
      'PROCUREMENT_AUDIT_VIEW',
      'INVOICE_INTEGRITY_AUDIT',
      'PRODUCT_VERIFICATION_AUDIT',
      'INVENTORY_AUDIT',
      'CONSUMABLES_AUDIT',
      'RETURNS_AUDIT',
      'ASSET_SERVICE_AUDIT',
      'ASSET_RETIREMENT_AUDIT',
      'PHYSICAL_IDENTITY_AUDIT',
      'PROCUREMENT_VIEW',
      'INVOICE_INTEGRITY_VIEW',
      'PRODUCT_VERIFICATION_VIEW',
      'INVENTORY_VIEW',
      'CONSUMABLES_VIEW',
      'RETURNS_VIEW',
      'ASSET_SERVICE_VIEW',
      'ASSET_RETIREMENT_VIEW',
      'PHYSICAL_IDENTITY_VIEW',
    ],
  },
  {
    code: 'G11',
    slug: 'tenant-admin',
    role: 'TenantAdmin',
    name: 'GVMC Tenant Administrator',
    grants: [
      'PHYSICAL_IDENTITY_VIEW',
      'INVOICE_INTEGRITY_POLICY_ADMIN',
      'PRODUCT_VERIFICATION_POLICY_ADMIN',
      'INVENTORY_POLICY_ADMIN',
      'CONSUMABLES_POLICY_ADMIN',
      'RETURNS_POLICY_ADMIN',
      'ASSET_SERVICE_POLICY_ADMIN',
      'ASSET_SERVICE_PROVIDER_ADMIN',
      'ASSET_RETIREMENT_POLICY_ADMIN',
      'ASSET_RETIREMENT_PROVIDER_ADMIN',
      'PHYSICAL_IDENTITY_POLICY_ADMIN',
      'PHYSICAL_IDENTITY_DEVICE_ADMIN',
    ],
  },
];

const SUPERSEDED_ACCOUNT_SLUGS = [
  'dean',
  'executive',
  'buyer',
  'procurement-head',
  'budget',
  'invoice-entry',
  'invoice-review',
  'integrity-certifier',
  'receiving',
  'stores',
  'service-tech',
  'service-manager',
  'sanitization',
];

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function argValue(prefix) {
  const match = process.argv.find((arg) => arg.startsWith(`${prefix}=`));
  return match ? match.slice(prefix.length + 1) : undefined;
}

function password() {
  return `Gvmc-${crypto.randomBytes(12).toString('base64url')}!A7`;
}

function plan() {
  return {
    tenant: { name: 'Gyan Vihar Medical College', subdomain: 'gvmc' },
    launch_url: 'https://falcon.jataka.io/?tenant=gvmc',
    active_suites: [...ENABLED_MODULES],
    disabled_suites: MODULES.filter((m) => !ENABLED_MODULES.has(m)),
    dofa_feature_flags: FEATURE_STATES,
    account_count: ACCOUNTS.length,
    accounts: ACCOUNTS.map(({ code, slug, role, name }) => ({
      code,
      email: `${slug}.gvmc@mygyanvihar.com`,
      role,
      name,
    })),
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (!apply) {
    console.log(JSON.stringify(plan(), null, 2));
    return;
  }
  if (process.env.GVMC_FINANCE_PROVISION_CONFIRM !== 'GVMC-FINANCE-LAUNCH') {
    throw new Error(
      'Refusing mutation: set GVMC_FINANCE_PROVISION_CONFIRM=GVMC-FINANCE-LAUNCH',
    );
  }
  const rotateExistingPasswords = process.argv.includes(
    '--rotate-existing-passwords',
  );
  if (
    rotateExistingPasswords &&
    process.env.GVMC_FINANCE_ROTATE_CONFIRM !==
      'GVMC-FINANCE-RESET-TEST-CREDENTIALS'
  ) {
    throw new Error(
      'Refusing password rotation: set GVMC_FINANCE_ROTATE_CONFIRM=GVMC-FINANCE-RESET-TEST-CREDENTIALS',
    );
  }
  const out = argValue('--credentials-out');
  if (!out || !path.isAbsolute(out))
    throw new Error('--credentials-out must be an absolute path');
  if (fs.existsSync(out))
    throw new Error(
      'Credentials output already exists; choose a new secure path',
    );
  const constructionBudget = Number(process.env.GVMC_CONSTRUCTION_BUDGET_INR);
  if (!Number.isFinite(constructionBudget) || constructionBudget <= 0) {
    throw new Error(
      'GVMC_CONSTRUCTION_BUDGET_INR must be the approved positive INR funding limit',
    );
  }
  loadEnv();
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'university_governance',
  });
  await client.connect();
  const credentials = [];
  try {
    await client.query('BEGIN');
    const tenantResult = await client.query(
      `INSERT INTO tenants(name,subdomain,pg_schema,settings,is_active)
       VALUES('Gyan Vihar Medical College','gvmc','public',$1::jsonb,true)
       ON CONFLICT(subdomain) DO UPDATE SET name=EXCLUDED.name,is_active=true,
         settings=tenants.settings||EXCLUDED.settings,updated_at=NOW()
       RETURNING tenant_id`,
      [
        JSON.stringify({
          allowed_email_domains: ['gvmc.mygyanvihar.com', 'mygyanvihar.com'],
          launch_profile: 'FINANCE_DOFA_COMPLETE',
        }),
      ],
    );
    const tenantId = tenantResult.rows[0].tenant_id;
    const deptResult = await client.query(
      `INSERT INTO departments(dept_name,description)
       VALUES('GVMC Construction and Administration','Gyan Vihar Medical College construction-phase operations')
       ON CONFLICT(dept_name) DO UPDATE SET description=EXCLUDED.description,deleted_at=NULL,updated_at=NOW()
       RETURNING dept_id`,
    );
    const deptId = deptResult.rows[0].dept_id;
    const roleNames = [
      ...new Set(ACCOUNTS.flatMap((a) => [a.role, ...(a.extraRoles || [])])),
    ];
    for (const role of roleNames) {
      await client.query(
        `INSERT INTO roles(role_name,description) VALUES($1,$2) ON CONFLICT(role_name) DO UPDATE SET deleted_at=NULL`,
        [role, `GVMC finance launch role: ${role}`],
      );
    }
    const roleRows = await client.query(
      `SELECT role_id,role_name FROM roles WHERE role_name=ANY($1::text[])`,
      [roleNames],
    );
    const roles = new Map(roleRows.rows.map((r) => [r.role_name, r.role_id]));
    let adminUserId = null;
    let hodUserId = null;
    for (const account of ACCOUNTS) {
      const email = `${account.slug}.gvmc@mygyanvihar.com`;
      const existing = await client.query(
        `SELECT user_id FROM users WHERE tenant_id=$1 AND lower(official_email)=lower($2)`,
        [tenantId, email],
      );
      let userId;
      if (existing.rowCount) {
        userId = existing.rows[0].user_id;
        if (rotateExistingPasswords) {
          const temporaryPassword = password();
          const hash = await bcrypt.hash(temporaryPassword, 12);
          await client.query(
            `UPDATE users SET name=$2,role_id=$3,dept_id=$4,password_hash=$5,onboarding_status='PENDING_PASSWORD_RESET',is_active=true,deleted_at=NULL,updated_at=NOW() WHERE user_id=$1`,
            [
              userId,
              account.name,
              roles.get(account.role),
              account.dept ? deptId : null,
              hash,
            ],
          );
          credentials.push({
            code: account.code,
            name: account.name,
            email,
            temporary_password: temporaryPassword,
            must_change_password: true,
          });
        } else {
          await client.query(
            `UPDATE users SET name=$2,role_id=$3,dept_id=$4,is_active=true,deleted_at=NULL,updated_at=NOW() WHERE user_id=$1`,
            [
              userId,
              account.name,
              roles.get(account.role),
              account.dept ? deptId : null,
            ],
          );
        }
      } else {
        const temporaryPassword = password();
        const hash = await bcrypt.hash(temporaryPassword, 12);
        const inserted = await client.query(
          `INSERT INTO users(tenant_id,name,official_email,role_id,dept_id,password_hash,onboarding_status,is_active)
           VALUES($1,$2,$3,$4,$5,$6,'PENDING_PASSWORD_RESET',true) RETURNING user_id`,
          [
            tenantId,
            account.name,
            email,
            roles.get(account.role),
            account.dept ? deptId : null,
            hash,
          ],
        );
        userId = inserted.rows[0].user_id;
        credentials.push({
          code: account.code,
          name: account.name,
          email,
          temporary_password: temporaryPassword,
          must_change_password: true,
        });
      }
      if (account.code === 'G11') adminUserId = userId;
      if (account.code === 'G02') hodUserId = userId;
      await client.query(
        `UPDATE user_roles SET is_primary=false WHERE user_id=$1`,
        [userId],
      );
      await client.query(
        `INSERT INTO user_roles(user_id,role_id,is_primary) VALUES($1,$2,true) ON CONFLICT(user_id,role_id) DO UPDATE SET is_primary=true,deleted_at=NULL`,
        [userId, roles.get(account.role)],
      );
      for (const extraRole of account.extraRoles || []) {
        await client.query(
          `INSERT INTO user_roles(user_id,role_id,is_primary) VALUES($1,$2,false) ON CONFLICT(user_id,role_id) DO UPDATE SET deleted_at=NULL`,
          [userId, roles.get(extraRole)],
        );
      }
      await client.query(
        `DELETE FROM acq_access_grants WHERE tenant_id=$1 AND principal_user_id=$2`,
        [tenantId, userId],
      );
      for (const capability of account.grants) {
        await client.query(
          `INSERT INTO acq_access_grants(tenant_id,principal_user_id,capability,scope_type,scope_reference) VALUES($1,$2,$3,$4,$5)`,
          [
            tenantId,
            userId,
            capability,
            account.dept ? 'DEPARTMENT' : 'TENANT',
            account.dept ? String(deptId) : null,
          ],
        );
      }
    }
    const supersededEmails = SUPERSEDED_ACCOUNT_SLUGS.map(
      (slug) => `${slug}.gvmc@mygyanvihar.com`,
    );
    await client.query(
      `UPDATE users SET is_active=false,updated_at=NOW()
       WHERE tenant_id=$1 AND lower(official_email)=ANY($2::text[])`,
      [tenantId, supersededEmails],
    );
    await client.query(
      `UPDATE departments SET hod_user_id=$2,updated_at=NOW() WHERE dept_id=$1`,
      [deptId, hodUserId],
    );

    const funding = await client.query(
      `INSERT INTO acq_funding_sources(tenant_id,funding_source_type,name,allocated_amount,is_active)
       VALUES($1,'PROJECT','GVMC test funding source', $2, true)
       ON CONFLICT(tenant_id,funding_source_type,name) DO UPDATE SET
         allocated_amount=EXCLUDED.allocated_amount,is_active=true
       RETURNING funding_source_id`,
      [tenantId, constructionBudget],
    );

    await client.query(
      `INSERT INTO acq_vendor_scoring_policies
       (tenant_id,policy_version,category,status,weights,eligibility_rules,minimum_evidence,effective_from,published_by,published_at)
       VALUES($1,1,'*','PUBLISHED',$2::jsonb,$3::jsonb,$4::jsonb,NOW(),$5,NOW())
       ON CONFLICT(tenant_id,category,policy_version) DO NOTHING`,
      [
        tenantId,
        JSON.stringify({
          price: 25,
          delivery: 20,
          conformity: 20,
          invoice_accuracy: 10,
          warranty_service: 10,
          compliance: 10,
          availability: 5,
        }),
        JSON.stringify({
          requires_empanelment: true,
          requires_compliance: true,
          requires_category_match: true,
        }),
        JSON.stringify({ high_confidence: 10, medium_confidence: 3 }),
        adminUserId,
      ],
    );
    await client.query(
      `INSERT INTO acq_operational_policies(tenant_id,policy_version,status,reservation_days,published_by,published_at)
       VALUES($1,1,'PUBLISHED',14,$2,NOW()) ON CONFLICT(tenant_id,policy_version) DO NOTHING`,
      [tenantId, adminUserId],
    );
    await client.query(
      `INSERT INTO proc_match_policies
       (tenant_id,policy_version,category,fulfillment_type,status,quantity_tolerance,unit_price_tolerance,tax_tolerance,freight_tolerance,rounding_tolerance,require_receipt,require_service_acceptance,published_at)
       VALUES($1,1,'*','*','PUBLISHED',0,0,0,0,0,true,false,NOW())
       ON CONFLICT(tenant_id,category,fulfillment_type,policy_version) DO NOTHING`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO inv_integrity_policies
       (tenant_id,policy_version,category,invoice_type,status,factor_weights,required_evidence,published_by,published_at)
       VALUES($1,1,'*','*','PUBLISHED',$2::jsonb,'["ORIGINAL_INVOICE"]'::jsonb,$3,NOW())
       ON CONFLICT(tenant_id,category,invoice_type,policy_version) DO NOTHING`,
      [
        tenantId,
        JSON.stringify({
          SOURCE_DISCREPANCY: 25,
          PRICE_DEVIATION: 25,
          DOCUMENT_ANOMALY: 15,
          PRODUCT_ORDER_MISMATCH: 10,
          VENDOR_HISTORY: 10,
          MISSING_EVIDENCE: 5,
          PURCHASING_PATTERN: 5,
          REPEATED_DISCREPANCIES: 5,
        }),
        adminUserId,
      ],
    );
    await client.query(
      `INSERT INTO inv_identifier_policies(tenant_id,policy_version,status,product_pattern,batch_pattern,asset_pattern,rfid_pattern,lot_pattern,published_by,published_at)
       VALUES($1,1,'PUBLISHED','PRD-{tenant}-{seq6}','BAT-{tenant}-{yyyymm}-{seq6}','AST-{tenant}-{yyyy}-{seq6}','RFI-{tenant}-{yyyy}-{seq6}','LOT-{tenant}-{yyyy}-{seq6}',$2,NOW())
       ON CONFLICT DO NOTHING`,
      [tenantId, adminUserId],
    );
    await client.query(
      `INSERT INTO inv_category_policies(tenant_id,category,subject_type,policy_version,status,required_attributes,manufacturer_serial_required,rfid_required,published_by,published_at)
       VALUES($1,'*','ITEM',1,'PUBLISHED','[]',false,false,$2,NOW()),($1,'*','LOT',1,'PUBLISHED','[]',false,false,$2,NOW())
       ON CONFLICT DO NOTHING`,
      [tenantId, adminUserId],
    );
    await client.query(
      `INSERT INTO con_stock_policies(tenant_id,policy_version,status,minimum_level,reorder_level,safety_level,target_level,published_by,published_at)
       VALUES($1,1,'PUBLISHED',0,0,0,0,$2,NOW()) ON CONFLICT DO NOTHING`,
      [tenantId, adminUserId],
    );
    await client.query(
      `INSERT INTO proc_financial_recovery_policies(tenant_id,policy_version,status,published_by,published_at)
       VALUES($1,1,'PUBLISHED',$2,NOW()) ON CONFLICT DO NOTHING`,
      [tenantId, adminUserId],
    );
    await client.query(
      `INSERT INTO svc_preventive_policies
       (tenant_id,category,policy_version,status,interval_type,interval_days,warning_days,overdue_hold_required,required_tasks,required_evidence,acceptance_tests,reverification_mode,published_by,published_at)
       VALUES($1,'*',1,'PUBLISHED','CALENDAR',365,30,false,'[]','[]','[]','RISK_BASED',$2,NOW())
       ON CONFLICT DO NOTHING`,
      [tenantId, adminUserId],
    );
    await client.query(
      `INSERT INTO retirement_policies
       (tenant_id,category,policy_version,status,assessment_requirements,appraisal_required,data_bearing,environmental_requirements,provider_license_requirements,witness_count,reserve_tolerance_pct,finance_receipt_before_handover,certificate_retention_years,published_by,published_at)
       VALUES($1,'*',1,'PUBLISHED','["TECHNICAL","FINANCIAL","LEGAL","DATA","ENVIRONMENTAL"]',true,false,'[]','[]',1,0,true,10,$2,NOW())
       ON CONFLICT DO NOTHING`,
      [tenantId, adminUserId],
    );
    await client.query(
      `INSERT INTO dofa_matrices(tenant_id,domain,rule_key,amount_min,amount_max,required_roles,required_signatures,exception_escalate_role,is_active)
       SELECT $1,v.domain,v.rule_key,v.amount_min,v.amount_max,v.required_roles,v.required_signatures,v.exception_role,true
       FROM (VALUES
         ('ACQUISITION','L1',0::numeric,50000::numeric,ARRAY['HOD']::text[],1,'Dean'),
         ('ACQUISITION','L2',50000.01::numeric,200000::numeric,ARRAY['Dean']::text[],1,'COO'),
         ('ACQUISITION','L3',200000.01::numeric,500000::numeric,ARRAY['ProcurementHead','FinanceController']::text[],2,'COO'),
         ('ACQUISITION','L4',500000.01::numeric,1500000::numeric,ARRAY['COO']::text[],1,'President'),
         ('ACQUISITION','L5',1500000.01::numeric,NULL::numeric,ARRAY['Chairman']::text[],1,'Chairman'),
         ('ASSET_WRITEOFF','HEAVY',NULL::numeric,NULL::numeric,ARRAY['COO','CFO']::text[],2,'Chairman')
       ) v(domain,rule_key,amount_min,amount_max,required_roles,required_signatures,exception_role)
       WHERE NOT EXISTS(SELECT 1 FROM dofa_matrices m WHERE m.tenant_id=$1 AND m.domain=v.domain AND m.rule_key=v.rule_key)`,
      [tenantId],
    );
    await client.query(
      `INSERT INTO dofa_policy_graphs(tenant_id,domain,title,version,status,graph_json,compiled_matrix,minutes_ref,proposal_memo,published_at)
       SELECT $1,d.domain,d.domain||' DoFA',1,'PUBLISHED',
         jsonb_build_object('nodes',jsonb_agg(jsonb_build_object('id',m.rule_key,'type','band','data',jsonb_build_object('amount_min',m.amount_min,'amount_max',m.amount_max,'required_roles',m.required_roles,'required_signatures',m.required_signatures)) ORDER BY m.amount_min NULLS FIRST),'edges','[]'::jsonb),
         jsonb_agg(jsonb_build_object('rule_key',m.rule_key,'amount_min',m.amount_min,'amount_max',m.amount_max,'required_roles',m.required_roles,'required_signatures',m.required_signatures,'exception_escalate_role',m.exception_escalate_role) ORDER BY m.amount_min NULLS FIRST),
         'GVMC-LAUNCH','Initial approved GVMC Finance/DoFA policy',NOW()
       FROM (VALUES('ACQUISITION'),('ASSET_WRITEOFF')) d(domain)
       JOIN dofa_matrices m ON m.tenant_id=$1 AND m.domain=d.domain AND m.is_active
       WHERE NOT EXISTS(SELECT 1 FROM dofa_policy_graphs g WHERE g.tenant_id=$1 AND g.domain=d.domain AND g.status='PUBLISHED')
       GROUP BY d.domain`,
      [tenantId],
    );
    for (const moduleKey of MODULES) {
      const state = ENABLED_MODULES.has(moduleKey) ? 'ACTIVE' : 'OFF';
      const prior = await client.query(
        `SELECT state,revision FROM platform_module_states WHERE module_key=$1 AND tenant_id=$2 AND scope_type='TENANT' AND scope_id IS NULL FOR UPDATE`,
        [moduleKey, tenantId],
      );
      const previous = prior.rows[0]?.state || 'OFF';
      const revision = Number(prior.rows[0]?.revision || 0) + 1;
      if (!prior.rowCount || previous !== state) {
        await client.query(
          `INSERT INTO platform_module_states(module_key,tenant_id,scope_type,state,revision,changed_by,reason)
           VALUES($1,$2,'TENANT',$3,$4,$5,'GVMC finance-only initial launch')
           ON CONFLICT(module_key,tenant_id,scope_type,scope_id) DO UPDATE SET state=EXCLUDED.state,revision=EXCLUDED.revision,changed_by=EXCLUDED.changed_by,reason=EXCLUDED.reason,updated_at=NOW()`,
          [moduleKey, tenantId, state, revision, adminUserId],
        );
        await client.query(
          `INSERT INTO platform_module_activation_audit(module_key,tenant_id,scope_type,previous_state,new_state,revision,actor_id,reason)
           VALUES($1,$2,'TENANT',$3,$4,$5,$6,'GVMC finance-only initial launch')`,
          [moduleKey, tenantId, previous, state, revision, adminUserId],
        );
      }
    }
    for (const [feature, enabled] of Object.entries(FEATURE_STATES)) {
      await client.query(
        `INSERT INTO tenant_subscriptions(tenant_id,feature_key,is_enabled) VALUES($1,$2,$3) ON CONFLICT(tenant_id,feature_key) DO UPDATE SET is_enabled=EXCLUDED.is_enabled,updated_at=NOW()`,
        [tenantId, feature, enabled],
      );
    }
    await client.query('COMMIT');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
      out,
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          tenant: 'gvmc',
          launch_url: plan().launch_url,
          funding_source: {
            id: funding.rows[0].funding_source_id,
            name: 'GVMC test funding source',
            approved_limit_inr: constructionBudget,
          },
          credentials,
        },
        null,
        2,
      ),
      { mode: 0o600, flag: 'wx' },
    );
    console.log(
      JSON.stringify(
        {
          success: true,
          tenant_id: tenantId,
          created_credentials: credentials.length,
          credentials_file: out,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
