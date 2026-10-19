#!/bin/sh
# REVIEWABLE STAGING ONLY. Does not start/enable jobs, create roles, install
# packages, pull images, change upload permissions, restore or delete anything.
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run the reviewed installer as root' >&2; exit 1; }
[ "$#" = 1 ] || { echo 'Usage: install.sh /absolute/reviewed/config.json' >&2; exit 1; }
config=$1
case "$config" in /*) ;; *) echo 'An absolute config path is required' >&2; exit 1 ;; esac
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
command -v python3 >/dev/null
[ -x /usr/bin/curl ] || { echo 'Expected TLS-verifying /usr/bin/curl is missing' >&2; exit 1; }
[ -x /usr/bin/docker ] || { echo 'Expected /usr/bin/docker is missing' >&2; exit 1; }
python3 - "$source_dir" "$config" <<'PY'
import importlib.util, json, os, pathlib, stat, subprocess, sys
source, config_path = sys.argv[1:]
spec = importlib.util.spec_from_file_location('backup_review', pathlib.Path(source)/'falcon_backup.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
with open(config_path) as stream:
    c = m.validate_config(json.load(stream))
if any('REVIEW_REQUIRED' in str(value) for value in c.values()):
    raise SystemExit('Review placeholders remain')
for key in ('uploads_source','pgpass_file'):
    path = pathlib.Path(c[key])
    if path.is_symlink() or not path.exists():
        raise SystemExit('Missing or symlinked ' + key)
    # Refuse symlink ancestors too.
    fd=m.open_directory(path if key=='uploads_source' else path.parent)
    os.close(fd)
p = os.stat(c['pgpass_file'], follow_symlinks=False)
if not stat.S_ISREG(p.st_mode) or p.st_mode & 0o077 or p.st_uid != c['worker_uid'] or p.st_nlink != 1:
    raise SystemExit('pgpass must be single-link regular, worker UID owned, mode 0600 or 0400')
subprocess.run(['/usr/bin/docker','--host','unix:///run/docker.sock','image','inspect',c['image']],check=True,stdout=subprocess.DEVNULL)
subprocess.run(['/usr/bin/docker','--host','unix:///run/docker.sock','network','inspect',c['network']],check=True,stdout=subprocess.DEVNULL)
# Existing roots must be safe before any install writes occur.
for root in ('/opt/falcon-local-backup','/etc/falcon-local-backup','/data/falcon-backups',c['staging_root'],c['final_root']):
    p=pathlib.Path(root)
    if p.exists() or p.is_symlink():
        fd=m.open_directory(p)
        info=os.fstat(fd)
        os.close(fd)
        if info.st_uid != 0 or info.st_mode & 0o022:
            raise SystemExit('Unsafe existing installation root: '+root)
print('Preflight passed; no image was pulled and no database was contacted')
PY
install -d -m 0700 /opt/falcon-local-backup /etc/falcon-local-backup /data/falcon-backups /run/falcon-local-backup
python3 - "$config" <<'PY'
import json, os, sys
from pathlib import Path
with open(sys.argv[1]) as stream: c=json.load(stream)
for key in ('staging_root','final_root'):
    Path(c[key]).mkdir(mode=0o700, parents=True, exist_ok=True)
(Path(c['staging_root']).parent/'restore-check').mkdir(mode=0o700,exist_ok=True)
PY
for file in falcon_backup.py restore_check.py; do
    install -m 0700 "$source_dir/$file" "/opt/falcon-local-backup/$file"
done
for file in worker.sh restore-check.sh; do
    install -m 0555 "$source_dir/$file" "/opt/falcon-local-backup/$file"
done
install -m 0600 "$config" /etc/falcon-local-backup/config.json
for file in falcon-local-backup.service falcon-local-backup.timer falcon-local-backup-review.service falcon-local-backup-review.timer; do
    install -m 0644 "$source_dir/$file" "/etc/systemd/system/$file"
done
printf '%s\n' 'Files staged only. Timers remain disabled. Review config, UID access, SQL grants and resource gates before any separately authorized start.'
