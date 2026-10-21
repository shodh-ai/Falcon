# FALCON startup storage boundary

`backend/scripts/runtime-start.cjs` calls `assertStorageBoundary` before loading Nest or making database changes. The guard is a metadata check: it does not create a directory, initialize a volume, write a permission probe, change permissions, run migrations, or repair a failed boundary. A missing or changed boundary prevents the candidate API from starting. Deployment must keep the previous healthy container available when a candidate fails.

The guard always requires `/run/falcon/storage-boundary.json`. There is no environment-variable bypass or alternative policy path. The host supplies this file as an exact read-only file bind mount. The file must be root-owned, regular, single-linked, at most 64 KiB, and not group- or world-writable. Every parent in its container path must be a real, root-owned directory without group or world write permission. A root-owned `0444` file permits a later unprivileged application UID to read the non-secret policy. Do not put passwords, tokens, or encryption keys in this file.

The guard opens that file with `O_NOFOLLOW`, reads through the held descriptor, and compares descriptor/path identity and metadata before and after reading. It rejects duplicate JSON keys, invalid UTF-8, unknown fields, and malformed policies. The returned `result.baseline` is the same verified parsed object, recursively frozen. The launcher must use that object for database policy validation and must not reread the path.

## Protected policy format

This example is synthetic. The host reviewer must capture actual identifiers from the existing approved mounts; copying these values will fail.

```json
{
  "schema_version": 1,
  "upload_mounts": [
    {
      "destination": "/app/uploads",
      "mount_root": "/approved/application/uploads",
      "device": "8:1",
      "inode": "9007199254740993"
    }
  ],
  "readonly_mounts": [],
  "database": {
    "host": "approved-database",
    "port": 5432,
    "name": "postgres",
    "role": "postgres",
    "enforce_least_privilege": false
  }
}
```

`mount_root` is the kernel mountinfo **root** field, relative to its backing filesystem. It is not the mountinfo source field and is not necessarily Docker's host `Source` string. The host admission check must cross-check the approved Docker source and its existing device/inode against the container's mountinfo/stat identity. An inode is a decimal string so a 64-bit inode cannot be rounded by JavaScript. The device is a decimal Linux `major:minor` string.

`upload_mounts` must contain exactly `/app/uploads`, plus a second disjoint destination when `UPLOAD_PATH` resolves elsewhere. Missing/empty `UPLOAD_PATH`, `uploads`, `./uploads`, and `/app/uploads` select the normal root when the actual working directory is `/app`. Leading/trailing whitespace, traversal, controls, backslashes, a root destination, and another working directory are refused. No symlink ancestor or symlink root is accepted. All ancestors of every declared mount must be root-owned directories without group or world write permission; only the upload root itself is application-writable. The application must consume the same effective environment as the launcher; production dotenv loading must be disabled so a later `.env` load cannot redirect uploads or database access.

Every upload root must be an exact mountpoint on the approved existing filesystem root, with matching device and inode, read-write mount and superblock flags, and a real directory. Known ephemeral filesystems such as overlay, tmpfs, and ramfs are rejected. A normal image directory, a mount at an ancestor, or a new volume with the same destination cannot satisfy the check. `accessSync(R_OK|W_OK|X_OK)` checks the current process UID's permission on the root without writing. It does not prove access to every existing descendant; the scoped ACL and upload inventory review remains necessary before changing the application UID.

An additional approved read-only configuration mount has the same four identity fields plus `"kind": "file"` or `"kind": "directory"`. It must be an exact read-only mount with matching stat identity, no symlinks, and no group/world write permission. Regular configuration files must be root-owned. An explicitly approved directory may have another owner, which permits a private PostgreSQL Unix-socket directory in an isolated test; the protected baseline and exact inode identity still govern that mount. Entries cannot overlap uploads, each other, `/app` itself, or the policy path. Unknown mounts at, above, or below any declared boundary fail, as do unknown mounts under `/app`, `/data`, `/uploads`, or `/home/node`. Ordinary kernel and Docker metadata mounts elsewhere are not claimed as application storage verification.

The `database` block contains exactly `host`, `port`, `name`, `role`, and boolean `enforce_least_privilege`. A host can be an explicit hostname or a canonical absolute Unix-socket directory such as `/restore-socket`. A Unix-socket host must also be an explicit, matching read-only directory entry in `readonly_mounts`; environment values must exactly match the protected database policy. The startup database check validates the connected identity and the selected privilege stage. An initial owner-approved transition can pin the existing role with `enforce_least_privilege: false`. This is not a least-privilege claim. A separate reviewed policy/environment change must select the restricted runtime role and set the flag to `true` after permissions are ready.

## Rollout and evidence

1. Review the current host storage mappings, long-lived PostgreSQL and Redis volume identities, upload inventory, current backup state, and candidate resource capacity. Capture the existing approved filesystem and database policy without creating a replacement volume or directory.
2. Install the root-controlled read-only policy mount for the candidate, preserving the existing uploads source and database endpoint. Verify that production dotenv loading is disabled. Review the effective image entrypoint so every startup reaches the guard before Nest; the API must not carry a migration credential or run automatic migrations.
3. Run a candidate with the approved existing mounts and policy. Keep the previous healthy container until candidate health and intended release identity are verified. A failed gate is a failed release: investigate the mismatch rather than weakening the policy or initializing new storage.
4. Review the narrower UID/ACL and database-role changes as separate stages. Snapshot permissions first, apply only the approved scope, validate descendant access/inventory, and keep the phase-specific rollback procedure available.

Run the focused tests without installing dependencies:

```sh
node --test backend/scripts/storage-boundary.spec.cjs backend/scripts/runtime-start.spec.cjs
```

Tests use synthetic filesystem/mount metadata and exercise refused mounts, policy races, symlinks, malformed policies, permission failures, and startup ordering. They do not prove a particular host deployment. The guard checks identities at startup; it does not continuously monitor host mounts, stop a privileged host operator from changing them, verify all database/Redis host volumes, supply atomic database/uploads snapshots, or prove application recovery. Those require the separate host admission, backup/restore, and deployment evidence. Local backups on the same server still do not protect against server loss.
