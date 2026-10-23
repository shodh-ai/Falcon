import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import {
  isPathWithin,
  isSafeStorageKey,
  isSafeTenantId,
  resolveStoredDiskPath,
  resolveTenantDiskPath,
} from './disk-file-path';

describe('stored disk file boundary', () => {
  let fixtureRoot: string;
  let root: string;
  let previousUploadPath: string | undefined;

  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), 'falcon-disk-path-'));
    root = join(fixtureRoot, 'uploads');
    previousUploadPath = process.env.UPLOAD_PATH;
    process.env.UPLOAD_PATH = root;
    mkdirSync(join(root, 'tenant-a'), { recursive: true });
    mkdirSync(join(root, 'tenant-b'), { recursive: true });
    writeFileSync(join(root, 'tenant-a', 'proof.pdf'), 'tenant A document');
    writeFileSync(join(root, 'tenant-b', 'proof.pdf'), 'tenant B document');
  });

  afterEach(() => {
    if (previousUploadPath == null) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = previousUploadPath;
    if (!isPathWithin(tmpdir(), fixtureRoot))
      throw new Error('Invalid fixture root');
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('accepts absolute, cwd-relative, virtual upload URLs and bare keys', () => {
    const file = join(root, 'tenant-a', 'proof.pdf');
    for (const stored of [
      file,
      relative(process.cwd(), file),
      '/uploads/tenant-a/proof.pdf',
      'tenant-a/proof.pdf',
    ]) {
      // A cwd-relative temporary path contains traversal segments, so it must fail.
      if (stored.split(/[\\/]/).includes('..')) {
        expect(resolveStoredDiskPath(stored)).toBeNull();
      } else {
        expect(resolveStoredDiskPath(stored)).toBe(realpathSync(file));
      }
    }
  });

  it('accepts a non-traversing cwd-relative path under the configured root', () => {
    const previousCwd = process.cwd();
    try {
      process.chdir(fixtureRoot);
      expect(resolveStoredDiskPath('uploads/tenant-a/proof.pdf')).toBe(
        realpathSync(join(root, 'tenant-a', 'proof.pdf')),
      );
    } finally {
      process.chdir(previousCwd);
    }
  });

  it.each([
    's3://bucket/tenant-a/proof.pdf',
    'https://example.test/uploads/tenant-a/proof.pdf',
    '/uploads/tenant-a/../tenant-b/proof.pdf',
    'tenant-a\\..\\tenant-b\\proof.pdf',
    'tenant-a/.. /tenant-b/proof.pdf',
    'tenant-a/folder./proof.pdf',
    'tenant-a/missing.pdf',
    'tenant-a',
  ])('rejects unavailable or unsafe locations: %s', (value) => {
    expect(resolveStoredDiskPath(value)).toBeNull();
  });

  it('rejects an existing similarly named root sibling', () => {
    const sibling = `${root}-other`;
    mkdirSync(sibling);
    const file = join(sibling, 'secret.pdf');
    writeFileSync(file, 'outside upload root');
    expect(resolveStoredDiskPath(file)).toBeNull();
    expect(isPathWithin(root, sibling)).toBe(false);
    expect(isPathWithin(root, root)).toBe(false);
  });

  it.each([
    'tenant-a/.. /proof.pdf',
    'tenant-a/folder./proof.pdf',
    'tenant-a/folder /proof.pdf',
    'tenant-a/proof.pdf.',
    'tenant-a/proof.pdf ',
  ])('rejects Windows-normalized key segments: %s', (key) => {
    expect(isSafeStorageKey(key, 'tenant-a')).toBe(false);
  });

  it.each([undefined, null, 123, ['tenant-a/proof.pdf'], {}])(
    'rejects non-string runtime parameters without throwing: %p',
    (value) => {
      expect(isSafeStorageKey(value)).toBe(false);
      expect(isSafeTenantId(value)).toBe(false);
      expect(resolveStoredDiskPath(value)).toBeNull();
    },
  );

  it('checks real paths so directory links cannot escape storage or a tenant', () => {
    const outside = join(fixtureRoot, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'secret.pdf'), 'outside');
    symlinkSync(outside, join(root, 'tenant-a', 'outside-link'), 'junction');
    expect(
      resolveStoredDiskPath('tenant-a/outside-link/secret.pdf'),
    ).toBeNull();

    symlinkSync(
      join(root, 'tenant-b'),
      join(root, 'tenant-a', 'other-tenant'),
      'junction',
    );
    const linked = 'tenant-a/other-tenant/proof.pdf';
    expect(resolveStoredDiskPath(linked)).toBe(
      realpathSync(join(root, 'tenant-b', 'proof.pdf')),
    );
    expect(resolveTenantDiskPath(linked, 'tenant-a')).toBeNull();
    expect(resolveTenantDiskPath('tenant-b/proof.pdf', 'tenant-a')).toBeNull();
  });
});
