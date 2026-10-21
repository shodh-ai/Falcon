'use strict';

// This launcher only checks storage and database metadata before loading Nest.
// It never invokes a migration, initializes storage, changes ACLs or logs secrets.
const MATERIALIZED_VIEWS = [
  'iqac_mv_placement_stats', 'iqac_mv_student_counts',
  'iqac_mv_faculty_metrics', 'iqac_mv_repository_health',
  'exec_mv_finance_summary', 'exec_mv_placement_trends',
  'exec_mv_academic_schools', 'exec_daily_university_health',
];

function databasePolicy(env, policy) {
  if (!policy || Object.keys(policy).sort().join(',') !==
      'enforce_least_privilege,host,name,port,role') {
    throw new Error('Protected database boundary is missing or invalid');
  }
  if (typeof policy.enforce_least_privilege !== 'boolean' ||
      !Number.isInteger(policy.port) || policy.port < 1 || policy.port > 65535 ||
      !['host', 'name', 'role'].every(k => typeof policy[k] === 'string' && policy[k].trim())) {
    throw new Error('Protected database boundary is invalid');
  }
  if (env.DB_SYNCHRONIZE !== 'false') {
    throw new Error('Runtime schema synchronization must be explicitly disabled');
  }
  if (Object.keys(env).some(k => k.startsWith('MIGRATION_DB_') && env[k])) {
    throw new Error('Migration credentials must not be injected into the API');
  }
  if (env.DB_HOST !== policy.host || env.DB_DATABASE !== policy.name ||
      env.DB_USERNAME !== policy.role || Number(env.DB_PORT || 5432) !== policy.port ||
      (env.DB_USER && env.DB_USER !== policy.role) || !env.DB_PASSWORD) {
    throw new Error('Runtime database configuration differs from its protected boundary');
  }
  return policy;
}

const ROLE_QUERY = `SELECT current_database() AS database_name,
  current_user AS role_name, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
  r.rolreplication, r.rolbypassrls,
  has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
  EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_'
    AND n.nspname <> 'information_schema'
    AND has_schema_privilege(current_user,n.oid,'CREATE')) AS schema_create,
  EXISTS (SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS memberships,
  (EXISTS (SELECT 1 FROM pg_database WHERE datdba=r.oid)
    OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner=r.oid)
    OR EXISTS (SELECT 1 FROM pg_class WHERE relowner=r.oid)
    OR EXISTS (SELECT 1 FROM pg_proc WHERE proowner=r.oid)
    OR EXISTS (SELECT 1 FROM pg_type WHERE typowner=r.oid)) AS owns_objects,
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prosecdef AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
    AND has_function_privilege(current_user,p.oid,'EXECUTE'))
    OR EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND p.prosecdef) AS security_definers,
  EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE CASE WHEN n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
      THEN (has_table_privilege(current_user,c.oid,'TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(current_user,c.oid,'REFERENCES'))
      ELSE false END) AS elevated_tables,
  EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE CASE WHEN n.nspname='public' AND c.relkind='S'
      THEN has_sequence_privilege(current_user,c.oid,'UPDATE')
      ELSE false END) AS elevated_sequences,
  has_table_privilege(current_user,'public.schema_migrations',
    'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR has_any_column_privilege(current_user,'public.schema_migrations',
      'INSERT,UPDATE,REFERENCES') AS ledger_mutation,
  NOT has_table_privilege(current_user,'public.schema_migrations','SELECT') AS missing_ledger_read,
  NOT has_schema_privilege(current_user,'public','USAGE') AS missing_schema_usage,
  EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE CASE WHEN n.nspname='public' AND c.relkind='S'
      THEN NOT (has_sequence_privilege(current_user,c.oid,'USAGE')
        AND has_sequence_privilege(current_user,c.oid,'SELECT'))
      ELSE false END) AS missing_sequence_access,
  EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE CASE WHEN n.nspname='public' AND c.relkind IN ('r','p','v','m')
      THEN has_table_privilege(current_user,c.oid,'MAINTAIN')
        AND NOT (c.relkind='m' AND c.relname=ANY(ARRAY[
          ${MATERIALIZED_VIEWS.map(name => "'" + name + "'").join(',')} ]::text[]))
      ELSE false END) AS unexpected_maintain,
  EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE CASE WHEN n.nspname='public' AND c.relkind='m'
      THEN (NOT has_table_privilege(current_user,c.oid,'SELECT')
        OR has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE')
        OR has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE'))
      ELSE false END) AS invalid_materialized_access,
  EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND (c.relrowsecurity OR c.relforcerowsecurity
      OR c.relkind='f')) AS unsupported_relations,
  (EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
      WHERE a.grantee=r.oid AND a.is_grantable)
    OR EXISTS (SELECT 1 FROM pg_attribute t CROSS JOIN LATERAL aclexplode(t.attacl) a
      WHERE a.grantee=r.oid AND a.is_grantable)
    OR EXISTS (SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a
      WHERE a.grantee=r.oid AND a.is_grantable)
    OR EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
      WHERE a.grantee=r.oid AND a.is_grantable)
    OR EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
      WHERE a.grantee=r.oid AND a.is_grantable)) AS privilege_delegation,
  EXISTS (SELECT 1 FROM pg_parameter_acl p
    WHERE has_parameter_privilege(current_user,p.parname,'SET,ALTER SYSTEM')) AS configuration_grants,
  EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE CASE WHEN n.nspname='public' AND c.relkind IN ('r','p','v')
        AND c.relname<>'schema_migrations'
      THEN NOT (has_table_privilege(current_user,c.oid,'SELECT')
        AND has_table_privilege(current_user,c.oid,'INSERT')
        AND has_table_privilege(current_user,c.oid,'UPDATE')
        AND has_table_privilege(current_user,c.oid,'DELETE'))
      ELSE false END) AS missing_business_access
  FROM pg_roles r WHERE r.rolname=current_user`;

async function verifyDatabase({ env, policy, Client }) {
  databasePolicy(env, policy);
  const PgClient = Client || require('pg').Client;
  const client = new PgClient({ host: env.DB_HOST, port: policy.port,
    database: env.DB_DATABASE, user: env.DB_USERNAME, password: env.DB_PASSWORD,
    connectionTimeoutMillis: 5000, query_timeout: 5000,
    statement_timeout: 5000, application_name: 'falcon-runtime-boundary' });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const result = await client.query(ROLE_QUERY);
    const row = result.rows[0];
    if (!row || row.database_name !== policy.name || row.role_name !== policy.role) {
      throw new Error('identity');
    }
    if (policy.enforce_least_privilege) {
      const forbidden = ['rolsuper','rolcreatedb','rolcreaterole','rolreplication',
        'rolbypassrls','database_create','schema_create','memberships','owns_objects',
        'security_definers','elevated_tables','elevated_sequences','ledger_mutation',
        'missing_ledger_read','missing_schema_usage','missing_sequence_access',
        'unexpected_maintain','invalid_materialized_access','unsupported_relations',
        'privilege_delegation','configuration_grants','missing_business_access'];
      if (forbidden.some(k => row[k] !== false)) throw new Error('privileges');
      const views = await client.query(`SELECT c.relname,
        has_table_privilege(current_user,c.oid,'SELECT') AS readable,
        has_table_privilege(current_user,c.oid,'MAINTAIN') AS maintainable
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='m' AND c.relname=ANY($1::text[])`,
      [MATERIALIZED_VIEWS]);
      if (views.rows.length !== MATERIALIZED_VIEWS.length ||
          views.rows.some(v => v.readable !== true || v.maintainable !== true)) throw new Error('reporting');
    }
    return { database_boundary_verified: true,
      least_privilege_enforced: policy.enforce_least_privilege };
  } catch {
    // Driver errors can contain connection strings or values. Never forward them.
    throw new Error('Runtime database boundary check failed; keep the previous healthy release');
  } finally {
    try { await client.query('ROLLBACK'); } catch {}
    try { await client.end(); } catch {}
  }
}

async function runRuntime({ env=process.env, verifyStorage,
  verifyDb=verifyDatabase, loadApplication, log=console.log }={}) {
  if (env.NODE_ENV !== 'production') throw new Error('Hardened runtime requires NODE_ENV=production');
  const storage = (verifyStorage || require('./storage-boundary.cjs').assertStorageBoundary)({env});
  databasePolicy(env, storage.baseline.database);
  const database = await verifyDb({env, policy: storage.baseline.database});
  log(JSON.stringify({storage_boundary_verified:true,
    database_boundary_verified:true, least_privilege_enforced:database.least_privilege_enforced}));
  (loadApplication || (() => require('../dist/main.js')))();
}

if (require.main === module) runRuntime().catch(error => {
  console.error(error.message);
  process.exitCode=1;
});
module.exports={databasePolicy,verifyDatabase,runRuntime,MATERIALIZED_VIEWS,ROLE_QUERY};
