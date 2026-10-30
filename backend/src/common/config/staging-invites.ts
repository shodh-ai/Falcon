import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import { UnauthorizedException } from '@nestjs/common';
import { isVerifiedStaging } from './staging-environment';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function stagingInviteAllows(value: unknown, userId: string, tenantId: string): boolean {
  if (!value || typeof value !== 'object') return false;
  const data = value as { version?: unknown; users?: unknown };
  if (Object.keys(data).sort().join(',') !== 'users,version' || data.version !== 1 ||
      !Array.isArray(data.users) || data.users.length < 1 || data.users.length > 500) return false;
  const seen = new Set<string>();
  for (const item of data.users as Array<Record<string, unknown>>) {
    if (!item || typeof item !== 'object' ||
        Object.keys(item).sort().join(',') !== 'tenant_id,user_id' ||
        typeof item.user_id !== 'string' || !UUID.test(item.user_id) ||
        typeof item.tenant_id !== 'string' || !UUID.test(item.tenant_id)) return false;
    const key = `${item.tenant_id}:${item.user_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return seen.has(`${tenantId}:${userId}`);
}

/** Host-owned, read-only directory mount; reread so invitation revocation is immediate. */
export function assertInvitedStaging(userId: string, tenantId: string): void {
  if (!isVerifiedStaging()) return;
  let fd: number | undefined;
  try {
    fd = openSync('/run/falcon/staging-access/invites.json', constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = fstatSync(fd);
    if (!info.isFile() || info.uid !== 0 || info.nlink !== 1 ||
        (info.mode & 0o222) !== 0 || info.size > 65536) throw new Error();
    if (!stagingInviteAllows(JSON.parse(readFileSync(fd, 'utf8')), userId, tenantId)) throw new Error();
  } catch {
    throw new UnauthorizedException('Staging access requires an explicit tester invitation');
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
