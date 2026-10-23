import { transformSync } from '@babel/core';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

interface NycLoader {
  loadNycConfig(options: {
    cwd: string;
    nycrcPath?: string;
  }): Promise<Record<string, unknown>>;
}

interface InstrumentedContext {
  module: { exports: unknown };
  __coverage__?: Record<
    string,
    {
      s: Record<string, number>;
      b: Record<string, number[]>;
    }
  >;
}

const requireFromTest = createRequire(__filename);
const { loadNycConfig } = requireFromTest(
  '@istanbuljs/load-nyc-config',
) as NycLoader;

describe('development dependency compatibility', () => {
  let fixtureDirectory: string;
  let configPath: string;

  beforeAll(async () => {
    fixtureDirectory = await mkdtemp(join(tmpdir(), 'falcon-tests-nyc-compat-'));
    configPath = join(fixtureDirectory, '.nycrc.yaml');
    await mkdir(join(fixtureDirectory, 'src'));
    await writeFile(
      join(fixtureDirectory, 'package.json'),
      JSON.stringify({
        name: 'falcon-tests-nyc-compatibility-fixture',
        private: true,
      }),
    );
    await writeFile(
      join(fixtureDirectory, 'nyc-base.yaml'),
      [
        'check-coverage: true',
        'statements: 85',
        'branches: 80',
        'exclude:',
        '  - "**/*.spec.js"',
        '',
      ].join('\n'),
    );
    await writeFile(
      configPath,
      [
        'extends: "./nyc-base.yaml"',
        '<<: &thresholds',
        '  lines: 85',
        '  functions: 85',
        'include: "src/**/*.js"',
        'extension: ".js"',
        'reporter:',
        '  - text',
        '  - lcov',
        '',
      ].join('\n'),
    );
  });

  afterAll(async () => {
    if (!fixtureDirectory) return;
    const fixturePath = resolve(fixtureDirectory);
    if (
      dirname(fixturePath) !== resolve(tmpdir()) ||
      !basename(fixturePath).startsWith('falcon-tests-nyc-compat-')
    ) {
      throw new Error('Refusing to remove a path outside the NYC test fixture');
    }
    await rm(fixturePath, { recursive: true, force: true });
  });

  it('loads an actual YAML NYC config with inheritance, merge keys and normalized file filters', async () => {
    const config = await loadNycConfig({
      cwd: fixtureDirectory,
      nycrcPath: configPath,
    });

    expect(config).toMatchObject({
      cwd: fixtureDirectory,
      checkCoverage: true,
      statements: 85,
      branches: 80,
      lines: 85,
      functions: 85,
      include: ['src/**/*.js'],
      exclude: ['**/*.spec.js'],
      extension: ['.js'],
      reporter: ['text', 'lcov'],
    });
    expect(config).not.toHaveProperty('extends');
  });

  it('instruments and executes both branches through Istanbul using the YAML loader', async () => {
    const filename = join(fixtureDirectory, 'src', 'grading-band.js');
    const source = [
      'module.exports = function gradingBand(mark) {',
      '  if (mark >= 50) return "pass";',
      '  return "review";',
      '};',
    ].join('\n');
    await writeFile(filename, source);
    const transformed = transformSync(source, {
      filename,
      cwd: fixtureDirectory,
      babelrc: false,
      configFile: false,
      plugins: [
        [
          requireFromTest.resolve('babel-plugin-istanbul'),
          { cwd: fixtureDirectory, nycrcPath: configPath },
        ],
      ],
    });
    if (!transformed?.code) {
      throw new Error('Istanbul did not produce executable fixture code');
    }
    const context: InstrumentedContext = { module: { exports: undefined } };
    runInNewContext(transformed.code, context, { timeout: 1000 });
    const gradingBand = context.module.exports as (mark: number) => string;

    expect(gradingBand(80)).toBe('pass');
    expect(gradingBand(30)).toBe('review');
    const coverage = context.__coverage__?.[filename];
    expect(coverage).toBeDefined();
    expect(Object.values(coverage!.s).every((hits) => hits > 0)).toBe(true);
    expect(Object.values(coverage!.b).flat()).toEqual([1, 1]);
  });
});
