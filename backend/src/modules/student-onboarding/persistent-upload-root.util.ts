import { ServiceUnavailableException } from '@nestjs/common';
import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

export function uploadRootIsMounted(root: string, mountInfo: string) {
  return mountInfo.split('\n').some((line) => {
    const type = line.split(' - ')[1]?.split(' ')[0];
    const mount = line.split(' ')[4]?.replace(/\\([0-7]{3})/g, (_, code) => String.fromCharCode(parseInt(code, 8)));
    return type && !['tmpfs', 'ramfs', 'overlay', 'aufs'].includes(type) && mount && mount !== '/' && (root === mount || root.startsWith(`${mount}/`));
  });
}

export async function requirePersistentUploadRoot() {
  const root = resolve(process.env.UPLOAD_PATH || './uploads');
  if (process.env.NODE_ENV !== 'production') return root;
  try {
    const actual = await realpath(root);
    if (uploadRootIsMounted(actual, await readFile('/proc/self/mountinfo', 'utf8'))) return actual;
  } catch { /* Never save a document to an unmounted container layer. */ }
  throw new ServiceUnavailableException('Document storage is not attached safely. No document was saved; please contact support.');
}
