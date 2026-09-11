import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { resolveApiModule } from './module-catalog';

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name);
    return entry.isDirectory() ? files(target) : [target];
  });
}

describe('business controller ownership coverage', () => {
  it('assigns every literal controller prefix to one module or CORE', () => {
    const uncovered: string[] = [];
    for (const file of files(join(__dirname, '..')).filter((item) =>
      item.endsWith('.controller.ts'),
    )) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(
        /@Controller\(\s*['"]([^'"]*)['"]\s*\)/g,
      )) {
        const route = `/${match[1]}`;
        if (!resolveApiModule(route)) uncovered.push(`${route} (${file})`);
      }
    }
    expect(uncovered).toEqual([]);
  });
});
