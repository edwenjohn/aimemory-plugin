'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let home;
before(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'aimemory-state-'));
  process.env.AIMEMORY_HOME = home;
});
after(() => {
  delete process.env.AIMEMORY_HOME;
  fs.rmSync(home, { recursive: true, force: true });
});

const { DEFAULTS } = require('../scripts/lib/config');
const { parseProjectsIndex } = require('../scripts/lib/projects');
const {
  sessionsDir, statePath, newState, loadState, saveState, recordChange, unsavedProjects, sweep,
} = require('../scripts/lib/state');

const memoryRoot = 'F:/mem';
const projects = parseProjectsIndex(fs.readFileSync(path.join(__dirname, 'fixtures', 'Projects.md'), 'utf8'), memoryRoot);
const SP = 'c:/wamp64/www/summitpharma/wp-content/themes/summitpharma-child';

test('newState has the spec shape and round-trips through save/load', () => {
  const s = newState({ sessionId: 'abc', tool: 'claude', cwd: SP, project: 'SummitPharma-Child-Theme' });
  assert.equal(s.sessionId, 'abc');
  assert.equal(s.tool, 'claude');
  assert.equal(s.project, 'SummitPharma-Child-Theme');
  assert.deepEqual(s.changes, {});
  assert.deepEqual(s.saved, {});
  assert.deepEqual(s.entryHeading, {});
  assert.equal(s.blockedOnce, false);
  assert.equal(s.paused, false);
  assert.equal(s.warnedUnregistered, false);
  assert.equal(s.warnedUnreachable, false);
  assert.ok(Date.parse(s.startedAt) > 0);
  assert.equal(loadState('abc'), null);
  saveState(s);
  assert.equal(statePath('abc'), path.join(sessionsDir(), 'abc.json'));
  assert.deepEqual(loadState('abc'), s);
});

test('statePath sanitises odd session ids', () => {
  assert.equal(path.basename(statePath('thr_12:3/4')), 'thr_12-3-4.json');
});

test('recordChange groups by project, ignores minified files, dedupes', () => {
  const s = newState({ sessionId: 's1', tool: 'claude', cwd: SP, project: 'SummitPharma-Child-Theme' });
  assert.equal(recordChange(s, `${SP}/src/Classes/Manager.php`, projects, DEFAULTS.ignore, memoryRoot), 'recorded');
  assert.equal(recordChange(s, `${SP}\\src\\Classes\\Manager.php`, projects, DEFAULTS.ignore, memoryRoot), 'recorded');
  assert.equal(recordChange(s, `${SP}/assets/css/shop.min.css`, projects, DEFAULTS.ignore, memoryRoot), 'ignored');
  assert.equal(recordChange(s, 'c:/wamp64/www/summitpharma/wp-content/plugins/summitpharma-auspost/x.php', projects, DEFAULTS.ignore, memoryRoot), 'recorded');
  assert.equal(recordChange(s, 'c:/elsewhere/readme.md', projects, DEFAULTS.ignore, memoryRoot), 'recorded');
  assert.equal(s.changes['SummitPharma-Child-Theme'].length, 1);
  assert.equal(s.changes['SummitPharma-AusPost'].length, 1);
  assert.deepEqual(s.changes._unregistered, ['c:/elsewhere/readme.md']);
  assert.equal(s.saved['SummitPharma-Child-Theme'], false);
});

test('writing a project DynamicMemory.md marks it saved and is not a change; other memory-root writes are ignored', () => {
  const s = newState({ sessionId: 's2', tool: 'codex', cwd: SP, project: 'SummitPharma-Child-Theme' });
  recordChange(s, `${SP}/functions.php`, projects, DEFAULTS.ignore, memoryRoot);
  assert.equal(recordChange(s, 'F:\\mem\\SummitPharma-Child-Theme\\DynamicMemory.md', projects, DEFAULTS.ignore, memoryRoot), 'memory-write');
  assert.equal(s.saved['SummitPharma-Child-Theme'], true);
  assert.equal(recordChange(s, 'F:/mem/SummitPharma-Child-Theme/Memory.md', projects, DEFAULTS.ignore, memoryRoot), 'ignored');
  assert.equal(recordChange(s, 'F:/mem/Projects.md', projects, DEFAULTS.ignore, memoryRoot), 'ignored');
  assert.equal(Object.keys(s.changes).length, 1);
});

test('a new change after save resets saved to false', () => {
  const s = newState({ sessionId: 's3', tool: 'claude', cwd: SP, project: 'SummitPharma-Child-Theme' });
  recordChange(s, `${SP}/a.php`, projects, DEFAULTS.ignore, memoryRoot);
  recordChange(s, 'F:/mem/SummitPharma-Child-Theme/DynamicMemory.md', projects, DEFAULTS.ignore, memoryRoot);
  assert.deepEqual(unsavedProjects(s), []);
  recordChange(s, `${SP}/b.php`, projects, DEFAULTS.ignore, memoryRoot);
  assert.equal(s.saved['SummitPharma-Child-Theme'], false);
  assert.deepEqual(unsavedProjects(s), [{ folder: 'SummitPharma-Child-Theme', files: [`${SP}/a.php`.toLowerCase(), `${SP}/b.php`.toLowerCase()] }]);
});

test('unsavedProjects excludes _unregistered', () => {
  const s = newState({ sessionId: 's4', tool: 'claude', cwd: 'c:/x', project: null });
  recordChange(s, 'c:/x/y.js', projects, DEFAULTS.ignore, memoryRoot);
  assert.deepEqual(unsavedProjects(s), []);
  assert.equal(s.changes._unregistered.length, 1);
});

test('sweep deletes state files older than 7 days only', () => {
  saveState(newState({ sessionId: 'old', tool: 'claude', cwd: 'c:/x', project: null }));
  saveState(newState({ sessionId: 'new', tool: 'claude', cwd: 'c:/x', project: null }));
  const old = new Date(Date.now() - 8 * 86400000);
  fs.utimesSync(statePath('old'), old, old);
  assert.equal(sweep(7), 1);
  assert.equal(fs.existsSync(statePath('old')), false);
  assert.equal(fs.existsSync(statePath('new')), true);
});
