import copy
import datetime as dt
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import preflight


class PreflightTests(unittest.TestCase):
    def setUp(self):
        self.now = dt.datetime(2026, 10, 19, 12, 0, tzinfo=dt.timezone.utc)
        self.image = 'sha256:' + 'a' * 64
        self.revision = 'b' * 40
        mount = {'Type': 'volume', 'Name': 'existing-uploads',
                 'Source': '/var/lib/docker/volumes/existing-uploads/_data',
                 'Destination': '/app/uploads', 'RW': True}
        previous = {'Id': 'c' * 64, 'Image': 'sha256:' + 'd' * 64,
                    'State': {'Running': True, 'Paused': False, 'Restarting': False,
                              'Health': {'Status': 'healthy'}},
                    'Config': {'Labels': None}, 'Mounts': [copy.deepcopy(mount)]}
        self.baseline = {'schema_version': 1, 'container_id': previous['Id'],
                         'image_id': previous['Image'], 'revision': 'e' * 40,
                         'revision_evidence': 'reviewed build-to-image mapping',
                         'persistent_mounts': [copy.deepcopy(mount)],
                         'writable_upload_targets': ['/app/uploads']}
        candidate = {'Id': 'f' * 64, 'Image': self.image,
                     'Config': {'User': '1000:1000', 'Labels': {
                         preflight.REVISION_LABEL: self.revision}},
                     'Mounts': [copy.deepcopy(mount)],
                     'HostConfig': {'ReadonlyRootfs': True, 'Privileged': False,
                         'CapDrop': ['ALL'], 'CapAdd': [],
                         'SecurityOpt': ['no-new-privileges:true'],
                         'PidMode': '', 'IpcMode': 'private', 'NetworkMode': 'private-net',
                         'Tmpfs': {'/tmp': 'rw,noexec,nosuid,nodev,size=64m'},
                         'Memory': 768 * preflight.MIB, 'MemorySwap': 768 * preflight.MIB}}
        stamp = self.now.isoformat()
        self.previous = {'observed_at': stamp, 'inspect': [previous],
                         'image_inspect': {'Id': previous['Image']}}
        self.candidate = {'observed_at': stamp, 'inspect': [candidate]}
        self.headroom = {'observed_at': stamp, 'available_memory_bytes': 2 * preflight.GIB,
                         'free_disk_bytes': 30 * preflight.GIB, 'working_bytes': preflight.GIB}

    def check(self):
        return preflight.validate(self.baseline, self.previous, self.candidate,
                                  self.headroom, self.image, self.revision, self.now)

    def test_valid_inspection_evidence_is_read_only(self):
        before = copy.deepcopy((self.baseline, self.previous, self.candidate, self.headroom))
        self.assertIn('deployment not performed', self.check()['result'])
        self.assertEqual(before, (self.baseline, self.previous, self.candidate, self.headroom))

    def test_missing_unexpected_and_repointed_persistent_mounts_refused(self):
        original = copy.deepcopy(self.candidate)
        for change in ('missing', 'extra', 'source', 'volume_name'):
            self.candidate = copy.deepcopy(original)
            mounts = self.candidate['inspect'][0]['Mounts']
            if change == 'missing': mounts.clear()
            elif change == 'extra': mounts.append({'Type': 'bind', 'Source': '/host/extra', 'Destination': '/extra', 'RW': False})
            elif change == 'source': mounts[0]['Source'] = '/host/replacement'
            else: mounts[0]['Name'] = 'new-empty-volume'
            with self.subTest(change=change), self.assertRaises(preflight.Refused): self.check()

    def test_unhealthy_or_wrong_previous_release_refused(self):
        previous = self.previous['inspect'][0]
        self.previous['image_inspect'] = {}
        with self.assertRaises(preflight.Refused): self.check()
        self.previous['image_inspect'] = {'Id': previous['Image']}
        previous['State']['Health']['Status'] = 'unhealthy'
        with self.assertRaises(preflight.Refused): self.check()
        previous['State']['Health']['Status'] = 'healthy'
        previous['Image'] = 'sha256:' + '1' * 64
        with self.assertRaises(preflight.Refused): self.check()

    def test_candidate_identity_root_or_writable_root_refused(self):
        candidate = self.candidate['inspect'][0]
        candidate['Config']['Labels'][preflight.REVISION_LABEL] = '1' * 40
        with self.assertRaises(preflight.Refused): self.check()
        candidate['Config']['Labels'][preflight.REVISION_LABEL] = self.revision
        for user in ('', 'root', '0:0', '1000:0', 'node'):
            candidate['Config']['User'] = user
            with self.subTest(user=user), self.assertRaises(preflight.Refused): self.check()
        candidate['Config']['User'] = '1000:1000'
        candidate['HostConfig']['ReadonlyRootfs'] = False
        with self.assertRaises(preflight.Refused): self.check()

    def test_unapproved_writable_mount_and_unbounded_tmpfs_refused(self):
        mount = {'Type': 'bind', 'Source': '/host/config', 'Destination': '/app/config', 'RW': True}
        self.baseline['persistent_mounts'].append(copy.deepcopy(mount))
        self.previous['inspect'][0]['Mounts'].append(copy.deepcopy(mount))
        self.candidate['inspect'][0]['Mounts'].append(copy.deepcopy(mount))
        with self.assertRaises(preflight.Refused): self.check()
        self.candidate['inspect'][0]['Mounts'][-1]['RW'] = False
        self.candidate['inspect'][0]['HostConfig']['Tmpfs']['/tmp'] = 'rw,noexec,nosuid,nodev'
        with self.assertRaises(preflight.Refused): self.check()

    def test_stale_or_insufficient_headroom_refused(self):
        for field, value in [('available_memory_bytes', preflight.GIB),
                             ('free_disk_bytes', 20 * preflight.GIB - 1),
                             ('observed_at', (self.now - dt.timedelta(minutes=6)).isoformat())]:
            original = self.headroom[field]
            self.headroom[field] = value
            with self.subTest(field=field), self.assertRaises(preflight.Refused): self.check()
            self.headroom[field] = original


if __name__ == '__main__':
    unittest.main()
