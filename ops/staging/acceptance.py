"""Required evidence categories before a staging deploy credential is enabled."""
import re
CHECKS={
 'network_denies_production_and_host','database_credentials_separate','sessions_separate',
 'tenant_and_role_denials','dummy_workflows_staging_only','browser_downloads_websockets_staging_only',
 'mail_captured_with_tls','payment_sms_ai_webhooks_local_only','runtime_schema_and_ledger_denied',
 'replacement_preserves_database_and_uploads','reset_rejects_production_targets',
 'production_health_mounts_and_dummy_record_absence','resource_reserve_preserved',
}


def validate_acceptance(value):
 if not isinstance(value,dict) or set(value)!={'version','enabled','tested_sha','tested_release_id','checks','evidence_sha256'} or \
    value['version']!=1 or value['enabled'] is not True or \
    not re.fullmatch(r'[a-f0-9]{40}',value['tested_sha']) or \
    not re.fullmatch(r'[a-f0-9]{16}',value['tested_release_id']) or \
    not re.fullmatch(r'[a-f0-9]{64}',value['evidence_sha256']) or \
    not isinstance(value['checks'],dict) or set(value['checks'])!=CHECKS or \
    any(v is not True for v in value['checks'].values()):
  raise RuntimeError('STAGING_ACCEPTANCE_REQUIRED')
 return value
