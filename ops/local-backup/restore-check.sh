#!/bin/sh
# One disposable database only. No production network, credentials or mounts.
set -eu
umask 077
export PGDATA=/scratch/data PGHOST=/scratch/socket PGPORT=55432
export PGUSER=restorecheck PGDATABASE=restorecheck
unset PGPASSWORD PGPASSFILE PGOPTIONS || true
case "$(postgres --version)" in *' 18.'*) ;; *) exit 20 ;; esac
[ -f /backup/database.dump ] && [ ! -e /backup/complete ] || exit 21
mkdir -m 0700 "$PGHOST"
initdb -U restorecheck --auth=trust --no-locale -E UTF8 >/dev/null 2>&1
trap 'pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true' EXIT HUP INT TERM
pg_ctl -D "$PGDATA" -o "-k /scratch/socket -p 55432 -c listen_addresses='' -c shared_buffers=16MB -c work_mem=1MB -c maintenance_work_mem=16MB -c max_connections=5 -c fsync=off -c full_page_writes=off" -w start >/dev/null 2>&1
createdb -w restorecheck >/dev/null 2>&1
pg_restore -w --exit-on-error --single-transaction --no-owner --no-acl --dbname restorecheck /backup/database.dump >/dev/null 2>&1
# Quoted identifiers/literals; no restored row contents reach this pipe.
psql -X -w -qAt -v ON_ERROR_STOP=1 --dbname restorecheck <<'SQL'
SELECT format('SELECT json_build_object(''schema'', %L, ''table'', %L, ''kind'', %L, ''rows'', count(*)) FROM ONLY %I.%I;',
              n.nspname, c.relname, c.relkind, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p', 'm', 'f')
  AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
ORDER BY n.nspname, c.relname
\gexec
SQL
printf '%s\n' '{"restore_inventory_complete":true}'
# Host completion marker allows a separately reviewed optional offline checker
# to use this private socket first. The helper's input bind is read-only.
attempt=0
while [ ! -e /backup/complete ]; do
    attempt=$((attempt+1))
    [ "$attempt" -le 1800 ] || exit 22
    sleep 1
done
# Globals are never executed. Scratch is retained; no database is dropped.
