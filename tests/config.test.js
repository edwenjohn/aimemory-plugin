'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let home;
before(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'aimemory-cfg-'));
  process.env.AIMEMORY_HOME = home;
});
after(() => {
  delete process.env.AIMEMORY_HOME;
  fs.rmSync(home, { recursive: true, force: true });
});

const { DEFAULTS, configPath, loadConfig, saveConfig, memoryRootReachable } = require('../scripts/lib/config');

test('DEFAULTS carry the spec values', () => {
  assert.equal(DEFAULTS.autoSave, 'block');
  assert.equal(DEFAULTS.pullEntries, 8);
  assert.equal(DEFAULTS.memoryInlineLimit, 40000);
  assert.ok(DEFAULTS.ignore.includes('**/*.min.css'));
  assert.ok(DEFAULTS.ignore.includes('**/.claude/**'));
});

test('loadConfig is null before first save', () => {
  assert.equal(configPath(), path.join(home, '.aimemory', 'config.json'));
  assert.equal(loadConfig(), null);
});

test('saveConfig merges defaults and persists', () => {
  const cfg = saveConfig({ memoryRoot: 'F:/mem' });
  assert.equal(cfg.memoryRoot, 'F:/mem');
  assert.equal(cfg.autoSave, 'block');
  assert.equal(cfg.pullEntries, 8);
  assert.equal(cfg.memoryInlineLimit, 40000);
  assert.ok(cfg.ignore.includes('**/*.min.css'));
  assert.deepEqual(loadConfig(), cfg);
  assert.ok(fs.existsSync(configPath()));
});

test('saveConfig twice keeps earlier keys', () => {
  saveConfig({ autoSave: 'remind' });
  const cfg = loadConfig();
  assert.equal(cfg.memoryRoot, 'F:/mem');
  assert.equal(cfg.autoSave, 'remind');
});

test('memoryRootReachable reflects the filesystem', () => {
  assert.equal(memoryRootReachable({ memoryRoot: home }), true);
  assert.equal(memoryRootReachable({ memoryRoot: path.join(home, 'nope') }), false);
  assert.equal(memoryRootReachable(null), false);
});
