/**
 * Explicit, forward-only deployment job. Never invoked by API startup.
 * Inject MIGRATION_DB_* only into this job, not into the API container.
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function migrationEnvironment(env) {
  const required = ['HOST', 'DATABASE', 'USERNAME', 'PASSWORD'];
  for (const name of required) {
    if (!String(env[`MIGRATION_DB_${name}`] ?? '').trim()) {
      throw new Error(`MIGRATION_DB_${name} must be explicitly configured`);
    }
  }
  const runtimeUser = String(env.DB_USERNAME || env.DB_USER || '').trim();
  const migrationUser = env.MIGRATION_DB_USERNAME.trim();
  if (runtimeUser && runtimeUser === migrationUser) {
    throw new Error('Migration and API database identities must be different');
  }
  const port = Number(env.MIGRATION_DB_PORT || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('MIGRATION_DB_PORT must be an integer from 1 to 65535');
  }

  const childEnv = { ...env };
  for (const key of Object.keys(childEnv)) {
    if (key.startsWith('MIGRATION_DB_')) delete childEnv[key];
  }
  return {
    ...childEnv,
    NODE_ENV: env.NODE_ENV || 'production',
    DB_HOST: env.MIGRATION_DB_HOST.trim(),
    DB_PORT: String(port),
    DB_DATABASE: env.MIGRATION_DB_DATABASE.trim(),
    DB_USERNAME: migrationUser,
    DB_USER: migrationUser,
    DB_PASSWORD: env.MIGRATION_DB_PASSWORD,
    DB_SYNCHRONIZE: 'false',
  };
}

function runDeploymentMigration({
  env = process.env,
  argv = process.argv.slice(2),
  spawn = spawnSync,
} = {}) {
  if (argv.length) {
    throw new Error(
      'Deployment migration accepts no repair, seed or other arguments',
    );
  }
  const childEnv = migrationEnvironment(env);
  const result = spawn(
    process.execPath,
    [path.join(__dirname, 'run-migrations.js')],
    {
      cwd: path.resolve(__dirname, '..'),
      env: childEnv,
      stdio: 'inherit',
    },
  );
  if (result.error)
    throw new Error('Unable to start the deployment migration job');
  if (result.signal)
    throw new Error('Deployment migration job was interrupted');
  if (!Number.isInteger(result.status) || result.status !== 0) {
    throw new Error(
      'Deployment migration failed; do not start the new API release',
    );
  }
}

if (require.main === module) {
  try {
    runDeploymentMigration();
  } catch (error) {
    // Do not print environment values or driver errors containing credentials.
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { migrationEnvironment, runDeploymentMigration };
