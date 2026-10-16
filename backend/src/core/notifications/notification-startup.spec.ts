import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

describe('notification shutdown integration contract', () => {
  it('enables normal application shutdown hooks before listening', () => {
    // Parse only: importing main would start the application and its workers.
    const source = ts.createSourceFile(
      'main.ts',
      readFileSync(resolve(__dirname, '../../main.ts'), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const bootstrap = source.statements.find(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) &&
        statement.name?.text === 'bootstrap',
    );
    const calls: string[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === 'app'
      ) {
        calls.push(node.expression.name.text);
      }
      ts.forEachChild(node, visit);
    };
    expect(bootstrap?.body).toBeDefined();
    if (bootstrap?.body) visit(bootstrap.body);
    expect(calls.filter((name) => name === 'enableShutdownHooks')).toHaveLength(
      1,
    );
    expect(calls).toContain('listen');
    expect(calls.indexOf('enableShutdownHooks')).toBeLessThan(
      calls.indexOf('listen'),
    );
  });
});
