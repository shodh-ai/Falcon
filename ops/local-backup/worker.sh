#!/bin/sh
# Fixed PG18 helper payload. No Docker socket, host root, SQL writes or restores.
set -eu
umask 077
export PGCONNECT_TIMEOUT=10
export PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=300000 -c lock_timeout=5000'
unset PGPASSWORD || true
case "$(pg_dump --version)" in *' 18.'*) ;; *) exit 20 ;; esac
case "$(pg_dumpall --version)" in *' 18.'*) ;; *) exit 20 ;; esac

# Refuse a more privileged credential and any inherited ordinary table write
# privilege. BYPASSRLS is intentional for a complete cross-tenant backup.
audit_sql="SELECT CASE WHEN NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND r.rolbypassrls AND NOT EXISTS (SELECT 1 FROM pg_roles member WHERE member.rolname NOT IN (current_user,'pg_read_all_data') AND pg_has_role(current_user,member.oid,'MEMBER')) AND current_setting('transaction_read_only')='on' AND NOT has_database_privilege(current_user,current_database(),'CREATE') AND NOT EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND has_schema_privilege(current_user,n.oid,'CREATE')) AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AND NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname !~ '^pg_' AND has_sequence_privilege(current_user,c.oid,'USAGE,UPDATE')) AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prosecdef AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema' AND has_function_privilege(current_user,p.oid,'EXECUTE')) THEN 'safe' ELSE 'unsafe' END FROM pg_roles r WHERE r.rolname=current_user"
actual=$(psql -X -w -A -t -v ON_ERROR_STOP=1 --dbname postgres -c "SELECT string_agg(datname,',' ORDER BY datname) FROM pg_database WHERE NOT datistemplate AND datallowconn")
expected=$(printf '%s' "$EXPECTED_DATABASES" | tr ',' '\n' | LC_ALL=C sort | paste -sd, -)
[ "$actual" = "$expected" ] || exit 21
oldifs=$IFS
IFS=,
for database in $EXPECTED_DATABASES; do
    IFS=$oldifs
    [ "$(psql -X -w -A -t -v ON_ERROR_STOP=1 --dbname "$database" -c "$audit_sql")" = safe ] || exit 22
    pg_dump -w --format=custom --no-owner --no-acl --lock-wait-timeout=5000 --host "$PGHOST" --port "$PGPORT" --username "$PGUSER" --dbname "$database" --file "/staging/database-$database.dump"
    pg_restore --list "/staging/database-$database.dump" >/dev/null
    IFS=,
done
IFS=$oldifs
pg_dumpall -w --globals-only --no-role-passwords --host "$PGHOST" --port "$PGPORT" --username "$PGUSER" > /staging/globals-no-passwords.sql

# Validate upload metadata before tar; refuse symlinks, hardlinks and devices.
# A read-only bind prevents helper writes, but concurrent application writes can
# still change files. Tar nonzero exit (including file changed) rejects the set.
find /source -mindepth 1 ! -type f ! -type d -print -quit > /tmp/unsafe-types
[ ! -s /tmp/unsafe-types ] || exit 23
find /source -type f -links +1 -print -quit > /tmp/unsafe-links
[ ! -s /tmp/unsafe-links ] || exit 23
find /source -type f -print0 > /tmp/files-before
LC_ALL=C sort -z /tmp/files-before > /tmp/files-before-sorted
while IFS= read -r -d '' file; do
    sum=$(sha256sum < "$file")
    printf '%s  %s\0' "${sum%% *}" "$file"
done < /tmp/files-before-sorted > /staging/uploads-before.sha256
# The pinned Alpine image uses BusyBox tar (no --format option). The privileged
# validator independently accepts only bounded USTAR files and directories.
tar -czf /staging/uploads.tar.gz -C /source .
tar -tzf /staging/uploads.tar.gz >/dev/null
find /source -type f -print0 > /tmp/files-after
LC_ALL=C sort -z /tmp/files-after > /tmp/files-after-sorted
while IFS= read -r -d '' file; do
    sum=$(sha256sum < "$file")
    printf '%s  %s\0' "${sum%% *}" "$file"
done < /tmp/files-after-sorted > /staging/uploads-after.sha256
cmp /tmp/files-before-sorted /tmp/files-after-sorted
cmp /staging/uploads-before.sha256 /staging/uploads-after.sha256
