#!/usr/bin/env node
'use strict';
// Static inventory only: importing this file never loads application code,
// environment files, databases, queues or external services.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const digest = (value) =>
  crypto.createHash('sha256').update(value).digest('hex');

function sourceFiles(root) {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(root, entry.name);
      return entry.isDirectory()
        ? sourceFiles(file)
        : /\.tsx?$/.test(entry.name) && !/\.(spec|test|d)\.ts$/.test(entry.name)
          ? [file]
          : [];
    })
    .sort();
}
function parse(file) {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
}
function decorators(node, imports) {
  return (ts.canHaveDecorators(node) ? ts.getDecorators(node) || [] : []).map(
    (decorator) => {
      const expression = decorator.expression;
      const call = ts.isCallExpression(expression) ? expression : undefined;
      const name = (call ? call.expression : expression).getText();
      const namespace = name.split('.')[0];
      const resolved =
        imports.get(namespace) === '*'
          ? name.slice(namespace.length + 1)
          : imports.get(name) || name;
      return {
        name: resolved,
        arguments: call?.arguments || [],
        text: decorator.getText(),
      };
    },
  );
}
function literalPaths(expression, constants, seen = new Set()) {
  if (!expression) return [''];
  if (ts.isStringLiteralLike(expression)) return [expression.text];
  if (ts.isArrayLiteralExpression(expression)) {
    const values = expression.elements.map((item) =>
      literalPaths(item, constants, seen),
    );
    return values.every(Boolean) ? values.flat() : null;
  }
  if (ts.isObjectLiteralExpression(expression)) {
    const entry = expression.properties.find(
      (p) => ts.isPropertyAssignment(p) && p.name.getText() === 'path',
    );
    return entry ? literalPaths(entry.initializer, constants, seen) : null;
  }
  if (
    ts.isIdentifier(expression) &&
    constants.has(expression.text) &&
    !seen.has(expression.text)
  ) {
    return literalPaths(
      constants.get(expression.text),
      constants,
      new Set([...seen, expression.text]),
    );
  }
  return null;
}
function localImports(file, source) {
  return source.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier.text)
    .filter((name) => name.startsWith('.'))
    .flatMap((name) => {
      const base = path.resolve(path.dirname(file), name.replace(/\.js$/, ''));
      return [base + '.ts', base + '.tsx', path.join(base, 'index.ts')].filter(
        (candidate) => fs.existsSync(candidate),
      );
    });
}
function inventory(backendRoot) {
  const src = path.join(backendRoot, 'src');
  const files = sourceFiles(src);
  const parsed = new Map(files.map((file) => [file, parse(file)]));
  const globalFiles = files.filter(
    (file) =>
      /[/\\](common|auth|tenant|module-control)[/\\]/.test(file) ||
      /[/\\](main|app\.module)\.ts$/.test(file),
  );
  const globalFingerprint = digest(
    globalFiles
      .map(
        (file) =>
          path.relative(src, file) + ':' + digest(fs.readFileSync(file)),
      )
      .join('\n') +
      (fs.existsSync(path.join(backendRoot, 'package-lock.json'))
        ? digest(fs.readFileSync(path.join(backendRoot, 'package-lock.json')))
        : ''),
  );
  const closureFingerprint = (file) => {
    const seen = new Set();
    function visit(current) {
      if (seen.has(current) || !parsed.has(current)) return;
      seen.add(current);
      localImports(current, parsed.get(current)).forEach(visit);
    }
    visit(file);
    return digest(
      globalFingerprint +
        [...seen]
          .sort()
          .map(
            (current) =>
              path.relative(src, current) +
              ':' +
              digest(fs.readFileSync(current)),
          )
          .join('\n'),
    );
  };
  const entries = [];
  for (const file of files) {
    const source = parsed.get(file);
    const importedNames = new Map();
    const constants = new Map();
    for (const statement of source.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        statement.importClause?.namedBindings &&
        ts.isNamedImports(statement.importClause.namedBindings)
      ) {
        for (const binding of statement.importClause.namedBindings.elements)
          importedNames.set(
            binding.name.text,
            binding.propertyName?.text || binding.name.text,
          );
      }
      if (
        ts.isImportDeclaration(statement) &&
        statement.importClause?.namedBindings &&
        ts.isNamespaceImport(statement.importClause.namedBindings)
      ) {
        importedNames.set(statement.importClause.namedBindings.name.text, '*');
      }
      if (ts.isVariableStatement(statement))
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.initializer)
            constants.set(declaration.name.text, declaration.initializer);
        }
    }
    const classes = source.statements.filter(ts.isClassDeclaration);
    function inheritedMembers(statement, seen = new Set()) {
      if (seen.has(statement)) return { members: [], unresolved: true };
      const own = statement.members.filter(ts.isMethodDeclaration);
      const extensions = statement.heritageClauses?.find(
        (h) => h.token === ts.SyntaxKind.ExtendsKeyword,
      );
      if (!extensions) return { members: own, unresolved: false };
      const parentName = extensions.types[0]?.expression.getText();
      const parent = classes.find(
        (candidate) => candidate.name?.text === parentName,
      );
      if (!parent) return { members: own, unresolved: true };
      const inherited = inheritedMembers(parent, new Set([...seen, statement]));
      return {
        members: [
          ...own,
          ...inherited.members.filter(
            (member) =>
              !own.some((m) => m.name.getText() === member.name.getText()),
          ),
        ],
        unresolved: inherited.unresolved,
      };
    }
    for (const statement of classes) {
      const classDecorators = decorators(statement, importedNames);
      const controller = classDecorators.find((d) => d.name === 'Controller');
      const gateway = classDecorators.find(
        (d) => d.name === 'WebSocketGateway',
      );
      const processor = classDecorators.find((d) => d.name === 'Processor');
      const className = statement.name?.text || '<anonymous>';
      const relativeFile = path
        .relative(backendRoot, file)
        .split(path.sep)
        .join('/');
      const fingerprint = closureFingerprint(file);
      const inherited = controller
        ? inheritedMembers(statement)
        : {
            members: statement.members.filter(ts.isMethodDeclaration),
            unresolved: false,
          };
      const members = inherited.members;
      for (const member of members) {
        const methodDecorators = decorators(member, importedNames);
        const name = member.name.getText();
        const routes = methodDecorators.filter((d) =>
          [
            'Get',
            'Head',
            'Options',
            'Post',
            'Put',
            'Patch',
            'Delete',
            'All',
          ].includes(d.name),
        );
        const subscriptions = methodDecorators.filter(
          (d) => d.name === 'SubscribeMessage',
        );
        const scheduled = methodDecorators.filter((d) =>
          ['Cron', 'Interval', 'Timeout', 'OnEvent'].includes(d.name),
        );
        const record = (kind, extra) =>
          entries.push({
            id: `${relativeFile}#${className}.${name}:${kind}`,
            kind,
            file: relativeFile,
            line:
              source.getLineAndCharacterOfPosition(member.getStart()).line + 1,
            className,
            method: name,
            fingerprint,
            classDecorators: classDecorators.map((d) => d.text),
            methodDecorators: methodDecorators.map((d) => d.text),
            ...extra,
          });
        if (controller && routes.length) {
          const parents = literalPaths(controller.arguments[0], constants);
          const paths = [];
          let unresolved = parents === null;
          for (const route of routes) {
            const children = literalPaths(route.arguments[0], constants);
            if (!children) {
              unresolved = true;
              continue;
            }
            if (parents)
              for (const parent of parents)
                for (const child of children)
                  paths.push({
                    verb: route.name.toUpperCase(),
                    path:
                      '/' +
                      [parent, child]
                        .map((v) => v.replace(/^\/+|\/+$/g, ''))
                        .filter(Boolean)
                        .join('/'),
                  });
          }
          record('http', {
            routes: paths,
            unresolved,
            effect: routes.every((r) =>
              ['Get', 'Head', 'Options'].includes(r.name),
            )
              ? 'read-candidate'
              : 'write-candidate',
          });
        }
        if (
          gateway &&
          (subscriptions.length ||
            ['handleConnection', 'handleDisconnect'].includes(name))
        ) {
          record('websocket', {
            events: subscriptions.map((d) =>
              d.arguments.map((a) => a.getText()).join(','),
            ),
            gateway: gateway.text,
          });
        }
        if (processor && name === 'process')
          record('queue', { queue: processor.text });
        if (scheduled.length)
          record('scheduled', { triggers: scheduled.map((d) => d.text) });
        if (
          [
            'onModuleInit',
            'onApplicationBootstrap',
            'beforeApplicationShutdown',
            'onModuleDestroy',
          ].includes(name)
        )
          record('lifecycle', {});
      }
      if (controller && inherited.unresolved) {
        entries.push({
          id: `${relativeFile}#${className}:inherited-routes`,
          kind: 'unresolved',
          file: relativeFile,
          fingerprint,
          unresolved: true,
          reason:
            'Inherited controller routes require explicit runtime inventory.',
        });
      }
    }
  }
  return entries.sort((a, b) => a.id.localeCompare(b.id));
}
function assess(entries, reviews, backendRoot) {
  const accepted = [];
  const blocked = [];
  for (const entry of entries) {
    const review = reviews[entry.id];
    let reason;
    if (entry.unresolved) reason = 'unresolved surface';
    else if (!review || review.status !== 'reviewed') reason = 'unreviewed';
    else if (review.fingerprint !== entry.fingerprint) reason = 'stale review';
    else if (
      !review.authorization ||
      !review.scope ||
      !review.effect ||
      !review.reviewer
    )
      reason = 'incomplete policy';
    else if (
      !Array.isArray(review.evidenceTests) ||
      !review.evidenceTests.length ||
      review.evidenceTests.some(
        (test) =>
          typeof test !== 'string' ||
          path.isAbsolute(test) ||
          test.includes('..') ||
          !fs.existsSync(path.join(backendRoot, test)),
      )
    )
      reason = 'missing test evidence';
    if (reason) blocked.push({ id: entry.id, reason });
    else accepted.push(entry.id);
  }
  return {
    accepted,
    blocked,
    counts: entries.reduce(
      (counts, entry) => ({
        ...counts,
        [entry.kind]: (counts[entry.kind] || 0) + 1,
      }),
      {},
    ),
  };
}
if (require.main === module) {
  const backendRoot = path.resolve(__dirname, '../..');
  const entries = inventory(backendRoot);
  const reviewPath = path.join(backendRoot, 'security/access-reviews.json');
  const reviews = JSON.parse(fs.readFileSync(reviewPath, 'utf8')).reviews;
  const result = assess(entries, reviews, backendRoot);
  if (process.argv.includes('--json'))
    console.log(JSON.stringify({ entries, ...result }, null, 2));
  else
    console.log(
      JSON.stringify(
        {
          counts: result.counts,
          reviewed: result.accepted.length,
          blocked: result.blocked.length,
          blockers: result.blocked.slice(0, 12),
          instruction:
            'Review every surface with authorization, tenant/resource scope and synthetic test evidence. See security/README.md.',
        },
        null,
        2,
      ),
    );
  if (process.argv.includes('--enforce') && result.blocked.length)
    process.exitCode = 1;
}
module.exports = { inventory, assess };
