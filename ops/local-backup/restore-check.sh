#!/bin/sh
# Only this disposable, network-isolated PostgreSQL instance is initialized.
set -eu
umask 077
export PGDATA=/scratch/data
export PGHOST=/tmp
export PGPORT=55432
export PGUSER=restorecheck
unset PGPASSWORD PGPASSFILE PGOPTIONS || true
case "$(postgres --version)" in *' 18.'*) ;; *) exit 20 ;; esac
initdb -U restorecheck --auth=trust --no-locale >/dev/null
pg_ctl -D "$PGDATA" -o "-k /tmp -p 55432 -c listen_addresses='' -c shared_buffers=16MB -c work_mem=1MB -c maintenance_work_mem=16MB -c max_connections=5 -c fsync=off -c full_page_writes=off" -w start >/dev/null
trap 'pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true' EXIT HUP INT TERM
index=0
for dump in /backup/database-*.dump; do
    [ -f "$dump" ] || exit 21
    index=$((index+1))
    target="restore_$index"
    createdb -w "$target"
    pg_restore -w --exit-on-error --single-transaction --no-owner --no-acl --dbname "$target" "$dump"
    psql -X -w -v ON_ERROR_STOP=1 --dbname "$target" -c 'SELECT count(*) FROM pg_class WHERE relkind IN ('"'"'r'"'"','"'"'p'"'"')' >/dev/null
done
[ "$index" -gt 0 ]
# Cluster globals are deliberately never executed. No production credentials or
# network are available. Upload archives are structurally inspected by finalizer.
