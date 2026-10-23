// @vitest-environment node

import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RuleTester, type Rule } from 'eslint';
import { globSync } from '../../../tools/next-eslint-glob/index.cjs';

const nodeRequire = createRequire(import.meta.url);
const temporaryRoot = realpathSync(tmpdir());
const fixture = mkdtempSync(path.join(temporaryRoot, 'falcon-next-eslint-glob-'));
const absoluteFixture = fixture.replace(/\\/g, '/');
const adapterPath = nodeRequire.resolve('../../../tools/next-eslint-glob/index.cjs');

for (const directory of [
  'apps/alpha/pages',
  'apps/beta/src/app/target',
  'apps/gamma/pages',
  'apps/.hidden/pages',
  'standalone/pages',
  'dir with spaces/pages',
  'literal(bracket)/pages',
]) {
  mkdirSync(path.join(fixture, directory), { recursive: true });
}
writeFileSync(path.join(fixture, 'apps/alpha/pages/target.tsx'), 'export default function Page() {}');
writeFileSync(path.join(fixture, 'apps/beta/src/app/page.tsx'), 'export default function Page() {}');
writeFileSync(path.join(fixture, 'apps/beta/src/app/target/page.tsx'), 'export default function Page() {}');
writeFileSync(path.join(fixture, 'apps/readme.txt'), 'not a directory');

afterAll(() => {
  const resolvedFixture = realpathSync(fixture);
  if (
    path.dirname(resolvedFixture) !== temporaryRoot ||
    !path.basename(resolvedFixture).startsWith('falcon-next-eslint-glob-')
  ) {
    throw new Error('Refusing to remove an unexpected fixture directory.');
  }
  rmSync(resolvedFixture, { recursive: true, force: true });
});

// Golden results captured from fast-glob 3.3.1 before replacing its dependency.
// Sorting is only for comparison: neither glob engine promises result order.
const directoryCases: [string, string[]][] = [
  ['apps/alpha', ['apps/alpha']],
  ['./apps/alpha', ['./apps/alpha']],
  ['apps/alpha/', ['apps/alpha/']],
  ['apps/*', ['apps/alpha', 'apps/beta', 'apps/gamma']],
  ['./apps/*', ['./apps/alpha', './apps/beta', './apps/gamma']],
  ['apps/{alpha,beta}', ['apps/alpha', 'apps/beta']],
  ['apps/{alpha,beta}/', ['apps/alpha/', 'apps/beta/']],
  ['apps/!(gamma)', ['apps/.hidden', 'apps/alpha', 'apps/beta']],
  ['apps/**/pages', ['apps/alpha/pages', 'apps/gamma/pages']],
  ['apps/**', ['apps/alpha', 'apps/alpha/pages', 'apps/beta', 'apps/beta/src', 'apps/beta/src/app', 'apps/beta/src/app/target', 'apps/gamma', 'apps/gamma/pages']],
  ['apps/.hidden', ['apps/.hidden']],
  ['apps/.*', ['apps/.hidden']],
  ['apps/missing', []],
  ['apps/readme.txt', []],
  ['dir with spaces', ['dir with spaces']],
  ['literal(bracket)', []],
  ['.', ['.']],
  ['./', ['./']],
  ['..', ['..']],
  [`${absoluteFixture}/apps/alpha`, [`${absoluteFixture}/apps/alpha`]],
  [`${absoluteFixture}/apps/*`, ['alpha', 'beta', 'gamma'].map((name) => `${absoluteFixture}/apps/${name}`)],
  [`${absoluteFixture}/apps/{alpha,beta}`, ['alpha', 'beta'].map((name) => `${absoluteFixture}/apps/${name}`)],
  [`${absoluteFixture}/apps/alpha/`, [`${absoluteFixture}/apps/alpha/`]],
  [`${absoluteFixture}/apps/missing`, []],
  [`${absoluteFixture}/*`, ['apps', 'dir with spaces', 'literal(bracket)', 'standalone'].map((name) => `${absoluteFixture}/${name}`)],
];

const directoryResults = JSON.parse(execFileSync(process.execPath, [
  '-e',
  `const adapter = require(process.argv[1]);
   const patterns = JSON.parse(process.argv[2]);
   process.stdout.write(JSON.stringify(patterns.map(pattern =>
     adapter.globSync(pattern, { onlyDirectories: true }).sort())));`,
  adapterPath,
  JSON.stringify(directoryCases.map(([pattern]) => pattern)),
], { cwd: fixture, encoding: 'utf8' })) as string[][];

describe('Next ESLint directory-glob compatibility', () => {
  it.each(directoryCases.map(([pattern, expected], index) => ({ pattern, expected, index })))('matches fast-glob directory results for $pattern', ({ expected, index }) => {
    expect(directoryResults[index]).toEqual(expected);
  });

  it('rejects new API usage instead of silently skipping Next root checks', () => {
    expect(() => globSync('', { onlyDirectories: true })).toThrow(TypeError);
    expect(() => Reflect.apply(globSync, undefined, ['apps/*', { onlyFiles: true }])).toThrow(TypeError);
    expect(() => Reflect.apply(globSync, undefined, ['apps/*', { onlyDirectories: true, cwd: fixture }])).toThrow(TypeError);
    expect(() => Reflect.apply(globSync, undefined, [['apps/*'], { onlyDirectories: true }])).toThrow(TypeError);
  });

  it('binds only the pinned real Next plugin to the private adapter', () => {
    const pluginRequire = createRequire(nodeRequire.resolve('@next/eslint-plugin-next/package.json'));
    const pluginPackage = JSON.parse(readFileSync(nodeRequire.resolve('@next/eslint-plugin-next/package.json'), 'utf8')) as { version: string };
    const replacementPackage = JSON.parse(readFileSync(pluginRequire.resolve('fast-glob/package.json'), 'utf8')) as { name: string };
    expect(pluginPackage.version).toBe('16.3.8');
    expect(replacementPackage.name).toBe('@falcon/next-eslint-root-glob');
    expect(realpathSync(pluginRequire.resolve('fast-glob'))).toBe(realpathSync(adapterPath));
  });

  it('keeps real Next root settings, arrays and Windows path normalization working', () => {
    const { getRootDirs } = nodeRequire('@next/eslint-plugin-next/dist/utils/get-root-dirs.js') as {
      getRootDirs: (context: { cwd: string; settings: { next?: { rootDir?: string | string[] } } }) => string[];
    };
    expect(getRootDirs({ cwd: fixture, settings: {} })).toEqual([fixture]);
    expect(getRootDirs({ cwd: fixture, settings: { next: { rootDir: `${absoluteFixture}/apps/{alpha,beta}` } } }).sort()).toEqual([
      `${absoluteFixture}/apps/alpha`, `${absoluteFixture}/apps/beta`,
    ]);
    expect(getRootDirs({ cwd: fixture, settings: { next: { rootDir: [`${absoluteFixture}/apps/alpha/`, `${absoluteFixture}/apps/missing`, `${absoluteFixture}/standalone`] } } })).toEqual([
      `${absoluteFixture}/apps/alpha/`, `${absoluteFixture}/standalone`,
    ]);
    if (process.platform === 'win32') {
      expect(getRootDirs({ cwd: fixture, settings: { next: { rootDir: path.join(fixture, 'apps', 'alpha') } } })).toEqual([`${absoluteFixture}/apps/alpha`]);
    }
  });

  it('still reports internal anchors through the actual Next ESLint rule', () => {
    const plugin = nodeRequire('@next/eslint-plugin-next') as { rules: Record<string, Rule.RuleModule> };
    const originalDescribe = RuleTester.describe;
    const originalIt = RuleTester.it;
    // Execute the real RuleTester assertions inside this Vitest case.
    RuleTester.describe = (_label, run) => run();
    RuleTester.it = (_label, run) => run();
    try {
      const tester = new RuleTester({
        languageOptions: { ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
      });
      const settings = { next: { rootDir: `${absoluteFixture}/apps/{alpha,beta}` } };
      tester.run('@next/next/no-html-link-for-pages', plugin.rules['no-html-link-for-pages'], {
        valid: [
          { code: 'const element = <a href="https://example.com/target">External</a>;', settings },
          { code: 'const element = <Link href="/target">Internal</Link>;', settings },
          { code: 'const element = <a href="/target" target="_blank">Separate tab</a>;', settings },
        ],
        invalid: [
          { code: 'const element = <a href="/target">Internal</a>;', settings: { next: { rootDir: `${absoluteFixture}/apps/alpha` } }, errors: [{ message: /Do not use an `<a>` element/ }] },
          { code: 'const element = <a href="/">Internal</a>;', settings: { next: { rootDir: `${absoluteFixture}/apps/beta` } }, errors: [{ message: /Do not use an `<a>` element/ }] },
        ],
      });
    } finally {
      RuleTester.describe = originalDescribe;
      RuleTester.it = originalIt;
    }
  });
});
