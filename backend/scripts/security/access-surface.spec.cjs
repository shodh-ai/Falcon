'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inventory, assess } = require('./access-surface.cjs');

test('enumerates aliases, socket joins, workers and scheduled work without executing sources', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-access-fixture-'));
  try {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(
      path.join(root, 'src/policy.ts'),
      'export const policy = true;',
    );
    fs.writeFileSync(
      path.join(root, 'src/synthetic.ts'),
      `
      import { Controller as Routes, Post, Get } from '@nestjs/common';
      import * as Nest from '@nestjs/common';
      import { policy } from './policy.js';
      throw new Error('Inventory must not execute application code');
      @Routes(['v1','api/v1']) class A {
        @Post(['item','alias']) mutate() {}
        @Get() read() {}
        @Post(dynamicPath()) unknown() {}
      }
      @WebSocketGateway({namespace:'/test'}) class B {
        @SubscribeMessage('join') enter() {}
        handleConnection() {}
      }
      @Processor('queue') class C { process() {} }
      class D { @Cron('* * * * *') sweep() {} @OnEvent('x') event() {} }
      abstract class Base { @Get('inherited') inherited() {} }
      @Routes('child') class Child extends Base {}
      @Nest.Controller('namespaced') class Namespaced { @Nest.Post('write') save() {} onModuleInit() {} }
    `,
    );
    const entries = inventory(root);
    assert.equal(entries.length, 11);
    const write = entries.find((e) => e.method === 'mutate');
    assert.deepEqual(write.routes, [
      { verb: 'POST', path: '/v1/item' },
      { verb: 'POST', path: '/v1/alias' },
      { verb: 'POST', path: '/api/v1/item' },
      { verb: 'POST', path: '/api/v1/alias' },
    ]);
    assert.equal(entries.find((e) => e.method === 'unknown').unresolved, true);
    assert.equal(entries.filter((e) => e.kind === 'websocket').length, 2);
    assert.equal(entries.filter((e) => e.kind === 'queue').length, 1);
    assert.equal(entries.filter((e) => e.kind === 'scheduled').length, 2);
    assert.deepEqual(entries.find((e) => e.className === 'Child').routes, [
      { verb: 'GET', path: '/child/inherited' },
    ]);
    assert.deepEqual(
      entries.find((e) => e.className === 'Namespaced' && e.kind === 'http')
        .routes,
      [{ verb: 'POST', path: '/namespaced/write' }],
    );
    assert.equal(assess(entries, {}, root).blocked.length, entries.length);
    const review = {
      status: 'reviewed',
      fingerprint: write.fingerprint,
      reviewer: 'synthetic reviewer',
      authorization: 'test action',
      scope: 'same test tenant',
      effect: 'writes test row',
      evidenceTests: ['proof.spec.ts'],
    };
    assert.equal(
      assess([write], { [write.id]: review }, root).blocked[0].reason,
      'missing test evidence',
    );
    fs.writeFileSync(
      path.join(root, 'proof.spec.ts'),
      '// synthetic test evidence',
    );
    assert.equal(
      assess([write], { [write.id]: review }, root).accepted.length,
      1,
    );
    fs.appendFileSync(
      path.join(root, 'src/policy.ts'),
      '\nexport const scope = "changed";',
    );
    assert.equal(
      assess(inventory(root), { [write.id]: review }, root).blocked.find(
        (b) => b.id === write.id,
      ).reason,
      'stale review',
    );
    fs.appendFileSync(
      path.join(root, 'src/synthetic.ts'),
      '\n// source changed\n',
    );
    assert.equal(
      assess(inventory(root), { [write.id]: review }, root).blocked.find(
        (b) => b.id === write.id,
      ).reason,
      'stale review',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
