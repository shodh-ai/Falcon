#!/bin/sh
# One disposable database only. No production network, credentials or mounts.
set -eu
umask 077
export PGDATA=/scratch/data PGHOST=/scratch/socket PGPORT=55432
export PGUSER=restorecheck PGDATABASE=restorecheck
unset PGPASSWORD PGPASSFILE PGOPTIONS || true
# Fresh scratch only. PostgreSQL errors can contain row values: retain them in
# private on-server diagnostics, never the inventory/stdout protocol or journal.
# Hold the file descriptors so restored SQL cannot redirect subsequent writes
# by replacing a scratch pathname. These are diagnostic, helper-owned files;
# they are not root-attested validation evidence.
set -C
: > /scratch/recovery-operations.log
: > /scratch/recovery-stages.log
: > /scratch/recovery-inventory.jsonl
set +C
exec 3>>/scratch/recovery-operations.log
exec 4>>/scratch/recovery-stages.log
exec 2>&3
stage() {
    case "$1" in
        preflight|initdb_start|initdb_done|postgres_start|postgres_ready|createdb_start|createdb_done|restore_start|restore_done|inventory_start|inventory_done|await_host_completion|completion_received|shutdown_start|shutdown_done|shutdown_unconfirmed|complete|failed) ;;
        *) exit 30 ;;
    esac
    printf '%s\n' "$1" >&4
}
postgres_attempted=0
finish() {
    result=$?
    trap - EXIT HUP INT TERM
    if [ "$postgres_attempted" -eq 1 ]; then
        stage shutdown_start
        if pg_ctl -D "$PGDATA" -m immediate stop >&3 2>&3; then
            stage shutdown_done
        else
            stage shutdown_unconfirmed
            [ "$result" -ne 0 ] || result=31
        fi
    fi
    printf 'exit_code=%s\n' "$result" >&4
    if [ "$result" -eq 0 ]; then stage complete; else stage failed; fi
    exit "$result"
}
trap finish EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
stage preflight
case "$(postgres --version)" in *' 18.'*) ;; *) exit 20 ;; esac
[ -f /backup/database.dump ] && [ ! -e /backup/complete ] || exit 21
mkdir -m 0700 "$PGHOST"
stage initdb_start
initdb -U restorecheck --auth=trust --no-locale -E UTF8 >&3 2>&3
stage initdb_done
stage postgres_start
postgres_attempted=1
pg_ctl -D "$PGDATA" -l /scratch/recovery-operations.log -o "-k /scratch/socket -p 55432 -c listen_addresses='' -c shared_buffers=16MB -c work_mem=1MB -c maintenance_work_mem=16MB -c max_connections=5 -c fsync=off -c full_page_writes=off" -w start >&3 2>&3
stage postgres_ready
stage createdb_start
createdb -w restorecheck >&3 2>&3
stage createdb_done
stage restore_start
pg_restore -w --exit-on-error --single-transaction --no-owner --no-acl --dbname restorecheck /backup/database.dump >&3 2>&3
stage restore_done
# Quoted identifiers/literals; no restored row contents reach this pipe.
stage inventory_start
psql -X -w -qAt -v ON_ERROR_STOP=1 --dbname restorecheck > /scratch/recovery-inventory.jsonl <<'SQL'
SELECT format('SELECT json_build_object(''schema'', %L, ''table'', %L, ''kind'', %L, ''rows'', count(*)) FROM ONLY %I.%I;',
              n.nspname, c.relname, c.relkind, n.nspname, c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p', 'm', 'f')
  AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
ORDER BY n.nspname, c.relname
\gexec
SQL
stage inventory_done
# A failed inventory command must not emit a partial stdout protocol.
cat /scratch/recovery-inventory.jsonl
printf '%s\n' '{"restore_inventory_complete":true}'
# Host completion marker allows a separately reviewed optional offline checker
# to use this private socket first. The helper's input bind is read-only.
attempt=0
stage await_host_completion
while [ ! -e /backup/complete ]; do
    attempt=$((attempt+1))
    [ "$attempt" -le 1800 ] || exit 22
    sleep 1
done
stage completion_received
# Globals are never executed. Scratch is retained; no database is dropped.
