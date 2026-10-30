'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const CLI = path.join(REPO, 'scripts', 'aimemory.js');
const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');

let home;
let memoryRoot;
let repoDir;
before(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'aimemory-cmd-'));
  process.env.AIMEMORY_HOME = home;
  memoryRoot = path.join(home, 'mem');
  repoDir = path.join(home, 'repo', 'summitpharma-child');
  fs.mkdirSync(path.join(memoryRoot, 'SummitPharma-Child-Theme'), { recursive: true });
  fs.mkdirSync(path.join(memoryRoot, 'Namba-AI-Framework'), { recursive: true });
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(memoryRoot, 'Projects.md'), fx('Projects.md')
    .replace('`c:\\wamp64\\www\\summitpharma\\wp-content\\themes\\summitpharma-child`', '`' + repoDir + '`'));
  fs.writeFileSync(path.join(memoryRoot, 'SummitPharma-Child-Theme', 'Memory.md'), fx('memory-large.md'));
  fs.writeFileSync(path.join(memoryRoot, 'SummitPharma-Child-Theme', 'DynamicMemory.md'), fx('dyn-h3.md'));
  fs.writeFileSync(path.join(memoryRoot, 'Namba-AI-Framework', 'Memory.md'), '# Namba\n\n## 1. TL;DR\n\nsmall\n');
  fs.writeFileSync(path.join(memoryRoot, 'Namba-AI-Framework', 'DynamicMemory.md'), fx('dyn-h2.md'));
});
after(() => {
  delete process.env.AIMEMORY_HOME;
  fs.rmSync(home, { recursive: true, force: true });
});

const { saveConfig } = require('../scripts/lib/config');
const { newState, saveState, loadState } = require('../scripts/lib/state');
const { parseEntries } = require('../scripts/lib/memory');

function run(args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    input: input === undefined ? '' : input, encoding: 'utf8', env: { ...process.env, AIMEMORY_HOME: home },
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* text mode */ }
  return { status: r.status, out: r.stdout, err: r.stderr, json };
}

beforeEach(() => {
  fs.rmSync(path.join(home, '.aimemory'), { recursive: true, force: true });
  saveConfig({ memoryRoot });
});

test('config get reports configured:false before setup and the config after', () => {
  fs.rmSync(path.join(home, '.aimemory'), { recursive: true, force: true });
  assert.deepEqual(run(['config', 'get']).json, { configured: false });
  saveConfig({ memoryRoot });
  const r = run(['config', 'get']).json;
  assert.equal(r.configured, true);
  assert.equal(r.memoryRoot, memoryRoot);
  assert.equal(r.autoSave, 'block');
});

test('config set memoryRoot validates existence, reports gitRepo and projectsIndex', () => {
  const bad = run(['config', 'set', 'memoryRoot', path.join(home, 'nope')]).json;
  assert.match(bad.error, /does not exist/i);
  const ok = run(['config', 'set', 'memoryRoot', memoryRoot]).json;
  assert.equal(ok.memoryRoot, memoryRoot);
  assert.equal(ok.gitRepo, false);
  assert.equal(ok.projectsIndex, true);
  const other = run(['config', 'set', 'autoSave', 'remind']).json;
  assert.equal(other.autoSave, 'remind');
  assert.match(run(['config', 'set', 'autoSave', 'sometimes']).json.error, /block, remind, off/);
  assert.equal(run(['config', 'set', 'pullEntries', '5']).json.pullEntries, 5);
});

test('config set --init-root creates starter Projects.md and README.md in an empty folder', () => {
  const empty = fs.mkdtempSync(path.join(home, 'empty-root-'));
  const r = run(['config', 'set', 'memoryRoot', empty, '--init-root']).json;
  assert.equal(r.projectsIndex, true);
  assert.ok(fs.existsSync(path.join(empty, 'Projects.md')));
  assert.ok(fs.existsSync(path.join(empty, 'README.md')));
  assert.match(fs.readFileSync(path.join(empty, 'Projects.md'), 'utf8'), /\| Project \| Path \(local repo\)/);
});

test('detect returns the project, method and warning fields', () => {
  const r = run(['detect', '--cwd', path.join(repoDir, 'src')]).json;
  assert.equal(r.project.folder, 'SummitPharma-Child-Theme');
  assert.equal(r.method, 'path');
  assert.deepEqual(run(['detect', '--cwd', home]).json, { project: null });
});

test('context resolves by cwd or argument, returns memory, entries, template, stubs; ambiguous names are reported', () => {
  const r = run(['context', '--cwd', repoDir]).json;
  assert.equal(r.project.folder, 'SummitPharma-Child-Theme');
  assert.ok(r.memory.includes('## 9. Security'));
  assert.equal(r.entries.length, 8);
  assert.ok(r.template.startsWith('### YYYY-MM-DD'));
  assert.equal(r.truncated, false);
  assert.deepEqual(r.stubs, []);
  const byArg = run(['context', 'namba ai framework']).json;
  assert.equal(byArg.project.folder, 'Namba-AI-Framework');
  assert.equal(byArg.template, null);
  assert.equal(byArg.entries.length, 3);
  const amb = run(['context', 'summitpharma']).json;
  assert.equal(amb.ambiguous.length, 2);
  assert.match(run(['context', 'zzz']).json.error, /no project matches/i);
  assert.match(run(['context', '--cwd', home]).json.error, /not registered/i);
});

test('status reports config, detection, state and hook log tail', () => {
  const s = newState({ sessionId: 'st-1', tool: 'claude', cwd: repoDir, project: 'SummitPharma-Child-Theme' });
  s.changes['SummitPharma-Child-Theme'] = ['x.php'];
  s.saved['SummitPharma-Child-Theme'] = false;
  saveState(s);
  const r = run(['status', '--session', 'st-1', '--cwd', repoDir]).json;
  assert.equal(r.config.memoryRoot, memoryRoot);
  assert.equal(r.memoryRootReachable, true);
  assert.equal(r.detected.project.folder, 'SummitPharma-Child-Theme');
  assert.deepEqual(r.state.changes['SummitPharma-Child-Theme'], ['x.php']);
  assert.deepEqual(r.unsaved, [{ folder: 'SummitPharma-Child-Theme', files: ['x.php'] }]);
  assert.ok(Array.isArray(r.hooksLog));
  const noSession = run(['status', '--cwd', repoDir]).json;
  assert.equal(noSession.state, null);
});

test('mark-saved, pause and resume update the session state', () => {
  saveState(newState({ sessionId: 'ps-1', tool: 'claude', cwd: repoDir, project: 'SummitPharma-Child-Theme' }));
  assert.equal(run(['pause', '--session', 'ps-1']).json.paused, true);
  assert.equal(loadState('ps-1').paused, true);
  assert.equal(run(['resume', '--session', 'ps-1']).json.paused, false);
  const r = run(['mark-saved', '--session', 'ps-1', '--project', 'SummitPharma-Child-Theme', '--heading', 'Did a thing [Claude Code]']).json;
  assert.equal(r.saved, true);
  const st = loadState('ps-1');
  assert.equal(st.saved['SummitPharma-Child-Theme'], true);
  assert.equal(st.entryHeading['SummitPharma-Child-Theme'], 'Did a thing [Claude Code]');
  assert.match(run(['pause', '--session', 'missing']).json.error, /no session state/i);
});

test('list reports every project with last entry date and open stubs', () => {
  const r = run(['list']).json;
  assert.equal(r.projects.length, 6);
  const sp = r.projects.find((p) => p.folder === 'SummitPharma-Child-Theme');
  assert.equal(sp.lastEntryDate, parseEntries(fx('dyn-h3.md')).slice(-1)[0].date);
  assert.equal(sp.openStubs, 0);
  const missing = r.projects.find((p) => p.folder === 'SummitAutomation');
  assert.equal(missing.lastEntryDate, null);
  assert.equal(missing.filesPresent, false);
});

test('search is case-insensitive, grouped by project, with nearest heading and line', () => {
  const r = run(['search', 'TILL EXPORT']).json;
  assert.ok(r.hits.length >= 1);
  const hit = r.hits[0];
  assert.equal(hit.project, 'SummitPharma-Child-Theme');
  assert.match(hit.file, /DynamicMemory\.md$/);
  assert.ok(hit.line > 0);
  assert.ok(hit.heading.length > 0);
  assert.match(hit.text, /till export/i);
  assert.equal(run(['search', 'zzzqqq-not-there']).json.hits.length, 0);
  assert.match(run(['search']).json.error, /search text/i);
});

test('init registers the current folder: creates files, appends the row, writes a marker only when the path is not indexed', () => {
  const newRepo = path.join(home, 'new-repo');
  fs.mkdirSync(path.join(newRepo, '.git', 'info'), { recursive: true });
  const r = run(['init', '--name', 'New Thing', '--folder', 'New-Thing', '--cwd', newRepo, '--type', 'CLI', '--summary', 'Does new things.']).json;
  assert.equal(r.folder, 'New-Thing');
  assert.ok(fs.existsSync(path.join(memoryRoot, 'New-Thing', 'Memory.md')));
  const dyn = fs.readFileSync(path.join(memoryRoot, 'New-Thing', 'DynamicMemory.md'), 'utf8');
  assert.ok(dyn.includes('# Dynamic Memory Log — New Thing'));
  assert.ok(dyn.includes('**Project:** New-Thing'));
  assert.ok(dyn.includes('`' + newRepo + '`'));
  const mem = fs.readFileSync(path.join(memoryRoot, 'New-Thing', 'Memory.md'), 'utf8');
  assert.ok(mem.includes('# AI Memory Framework — New Thing'));
  const idx = fs.readFileSync(path.join(memoryRoot, 'Projects.md'), 'utf8');
  assert.match(idx, /\| New Thing \| `[^`]*new-repo` \| CLI \| \[Memory\.md\]\(New-Thing\/Memory\.md\)/);
  // The path is now indexed, so no marker is needed.
  assert.equal(r.markerWritten, false);
  assert.equal(fs.existsSync(path.join(newRepo, '.aimemory')), false);
  assert.equal(run(['detect', '--cwd', newRepo]).json.project.folder, 'New-Thing');
  // Refuses an existing folder.
  assert.match(run(['init', '--name', 'Dup', '--folder', 'New-Thing', '--cwd', newRepo]).json.error, /already exists/i);
});

test('init writes a git-excluded marker when the repo path differs from the recorded path', () => {
  const movedRepo = path.join(home, 'moved-repo');
  fs.mkdirSync(path.join(movedRepo, '.git', 'info'), { recursive: true });
  const r = run(['init', '--name', 'Moved', '--folder', 'Moved', '--cwd', movedRepo, '--path', 'Q:/original/location']).json;
  assert.equal(r.markerWritten, true);
  assert.equal(fs.readFileSync(path.join(movedRepo, '.aimemory'), 'utf8').trim(), 'Moved');
  assert.match(fs.readFileSync(path.join(movedRepo, '.git', 'info', 'exclude'), 'utf8'), /^\.aimemory$/m);
  assert.equal(run(['detect', '--cwd', movedRepo]).json.method, 'marker');
});

test('append-entry appends from a file, marks saved and records the heading; --extend only extends the session\'s own last entry', () => {
  const dyn = path.join(memoryRoot, 'SummitPharma-Child-Theme', 'DynamicMemory.md');
  const original = fs.readFileSync(dyn, 'utf8');
  saveState(newState({ sessionId: 'ae-1', tool: 'claude', cwd: repoDir, project: 'SummitPharma-Child-Theme' }));
  const entryFile = path.join(home, 'entry.md');
  fs.writeFileSync(entryFile, '### 2026-10-30 — Added a thing [Claude Code]\n**Project:** SummitPharma-Child-Theme\n**Changed:** a.php\n**Status:** done\n');
  const r = run(['append-entry', '--project', 'SummitPharma-Child-Theme', '--session', 'ae-1', '--file', entryFile]).json;
  assert.equal(r.appended, true);
  assert.equal(r.extended, false);
  assert.equal(r.heading, 'Added a thing [Claude Code]');
  let st = loadState('ae-1');
  assert.equal(st.saved['SummitPharma-Child-Theme'], true);
  assert.equal(st.entryHeading['SummitPharma-Child-Theme'], 'Added a thing [Claude Code]');
  assert.equal(parseEntries(fs.readFileSync(dyn, 'utf8')).length, 11);

  // Extend: appends lines under the same entry instead of a new heading.
  fs.writeFileSync(entryFile, '**Changed:** b.php\n**Follow-up:** check cache\n');
  const e = run(['append-entry', '--project', 'SummitPharma-Child-Theme', '--session', 'ae-1', '--file', entryFile, '--extend']).json;
  assert.equal(e.extended, true);
  const text = fs.readFileSync(dyn, 'utf8');
  assert.equal(parseEntries(text).length, 11);
  assert.ok(text.replace(/\r\n/g, '\n').endsWith('**Changed:** a.php\n**Status:** done\n**Changed:** b.php\n**Follow-up:** check cache\n'));

  // Extend when another entry was appended since: falls back to a new entry and says so.
  fs.appendFileSync(dyn, '\r\n### 2026-10-30 — Someone else [Codex]\r\n**Status:** done\r\n');
  fs.writeFileSync(entryFile, '**Changed:** c.php\n');
  const f = run(['append-entry', '--project', 'SummitPharma-Child-Theme', '--session', 'ae-1', '--file', entryFile, '--extend']).json;
  assert.equal(f.extended, false);
  assert.match(f.error, /no longer the last entry/i);
  // 10 fixture entries + this session's entry + the other agent's + the continuation
  assert.equal(parseEntries(fs.readFileSync(dyn, 'utf8')).length, 13);
  fs.writeFileSync(dyn, original);
});

test('append-entry refuses an entry file whose heading is not a dated entry', () => {
  const entryFile = path.join(home, 'bad.md');
  fs.writeFileSync(entryFile, 'just some text\n');
  const r = run(['append-entry', '--project', 'SummitPharma-Child-Theme', '--session', 'ae-2', '--file', entryFile]).json;
  assert.match(r.error, /dated heading/i);
});

test('unknown command reports an error with exit code 1', () => {
  const r = run(['frobnicate']);
  assert.equal(r.status, 1);
  assert.match(r.json.error, /unknown command/i);
});

test('--text prints human-readable output instead of JSON', () => {
  const r = run(['list', '--text']);
  assert.equal(r.json, null);
  assert.match(r.out, /SummitPharma Child Theme/);
});
