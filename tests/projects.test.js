'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizePath } = require('../scripts/lib/paths');
const {
  parseProjectsIndex, detectProject, findMarker, projectForFile, resolveProjectArg, appendProjectRow,
} = require('../scripts/lib/projects');

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'Projects.md'), 'utf8');
const memoryRoot = 'F:/mem';
const projects = parseProjectsIndex(fixture, memoryRoot);

test('parses six projects with folders from Memory links', () => {
  assert.equal(projects.length, 6);
  const sp = projects.find((p) => p.folder === 'SummitPharma-Child-Theme');
  assert.ok(sp);
  assert.equal(sp.name, 'SummitPharma Child Theme');
  assert.equal(normalizePath(sp.repoPath), 'c:/wamp64/www/summitpharma/wp-content/themes/summitpharma-child');
  assert.equal(normalizePath(sp.memoryFile), 'f:/mem/summitpharma-child-theme/memory.md');
  assert.equal(normalizePath(sp.dynamicFile), 'f:/mem/summitpharma-child-theme/dynamicmemory.md');
  assert.match(sp.status, /^Active/);
  assert.match(sp.type, /WordPress child theme/);
  assert.ok(sp.summary.length > 20);
});

test('parser maps columns by header text, so reordered columns still parse', () => {
  const md = '| Path (local repo) | Project | Memory |\n|---|---|---|\n| `D:\\x\\y` | X Proj | [Memory.md](XProj/Memory.md) |\n';
  const ps = parseProjectsIndex(md, memoryRoot);
  assert.equal(ps.length, 1);
  assert.equal(ps[0].name, 'X Proj');
  assert.equal(ps[0].folder, 'XProj');
  assert.equal(normalizePath(ps[0].repoPath), 'd:/x/y');
});

test('detects by longest path prefix, case-insensitive (Review Focus 3)', () => {
  const r = detectProject({ cwd: 'C:\\wamp64\\www\\summitpharma\\wp-content\\themes\\summitpharma-child\\src', projects, memoryRoot });
  assert.equal(r.project.folder, 'SummitPharma-Child-Theme');
  assert.equal(r.method, 'path');
  assert.equal(r.warning, undefined);
});

test('kush and summit checkouts resolve to different projects', () => {
  const k = detectProject({ cwd: 'c:/wamp64/www/shopkush/wp-content/themes/kushshop-child', projects, memoryRoot });
  const s = detectProject({ cwd: 'c:/wamp64/www/summitpharma/wp-content/themes/summitpharma-child', projects, memoryRoot });
  assert.equal(k.project.folder, 'Kush-Shop-Child');
  assert.equal(s.project.folder, 'SummitPharma-Child-Theme');
});

test('unrelated folder is unregistered (null)', () => {
  assert.equal(detectProject({ cwd: 'C:/Windows/Temp', projects, memoryRoot }), null);
});

test('marker is used only when no path match; warns when the marker project lives elsewhere', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aimemory-marker-'));
  const nested = path.join(tmp, 'a', 'b');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(tmp, '.aimemory'), 'Namba-AI\n');
  const found = findMarker(nested);
  assert.equal(found.folder, 'Namba-AI');
  assert.equal(normalizePath(found.markerPath), normalizePath(path.join(tmp, '.aimemory')));

  // Marker project path does not exist on disk -> plain marker detection, no warning
  const projectsMissing = projects.map((p) => (p.folder === 'Namba-AI' ? { ...p, repoPath: 'Q:/definitely/not/here' } : p));
  const r = detectProject({ cwd: nested, projects: projectsMissing, memoryRoot });
  assert.equal(r.project.folder, 'Namba-AI');
  assert.equal(r.method, 'marker');
  assert.equal(r.warning, undefined);

  // Marker project path exists elsewhere -> still marker, but warned
  const existing = fs.mkdtempSync(path.join(os.tmpdir(), 'aimemory-existing-'));
  const projects2 = projects.map((p) => (p.folder === 'Namba-AI' ? { ...p, repoPath: existing } : p));
  const r2 = detectProject({ cwd: nested, projects: projects2, memoryRoot });
  assert.equal(r2.method, 'marker');
  assert.match(r2.warning, /Namba-AI/);

  // Path match beats marker
  const projects3 = projects.map((p) => (p.folder === 'SummitAutomation' ? { ...p, repoPath: tmp } : p));
  const r3 = detectProject({ cwd: nested, projects: projects3, memoryRoot });
  assert.equal(r3.project.folder, 'SummitAutomation');
  assert.equal(r3.method, 'path');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(existing, { recursive: true, force: true });
});

test('a directory named .aimemory on the walk path (the config dir) is not a marker', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aimemory-dirmarker-'));
  fs.mkdirSync(path.join(tmp, '.aimemory'));
  const nested = path.join(tmp, 'Documents', 'proj');
  fs.mkdirSync(nested, { recursive: true });
  assert.equal(findMarker(nested), null);
  assert.equal(detectProject({ cwd: nested, projects, memoryRoot }), null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('folder-name match is the last resort', () => {
  const r = detectProject({ cwd: 'X:/somewhere/SummitAutomation', projects, memoryRoot });
  assert.equal(r.project.folder, 'SummitAutomation');
  assert.equal(r.method, 'folder');
});

test('projectForFile uses the longest matching repo path', () => {
  const p = projectForFile('C:\\wamp64\\www\\summitpharma\\wp-content\\plugins\\summitpharma-auspost\\x.php', projects);
  assert.equal(p.folder, 'SummitPharma-AusPost');
  assert.equal(projectForFile('C:/elsewhere/x.php', projects), null);
});

test('resolveProjectArg: "summitpharma" is ambiguous, "summitauto" resolves, folder names resolve exactly', () => {
  const amb = resolveProjectArg('summitpharma', projects);
  assert.equal(amb.ambiguous.length, 2);
  assert.equal(resolveProjectArg('summitauto', projects).project.folder, 'SummitAutomation');
  assert.equal(resolveProjectArg('namba-ai', projects).project.folder, 'Namba-AI');
  assert.equal(resolveProjectArg('Namba AI Framework', projects).project.folder, 'Namba-AI-Framework');
  assert.equal(resolveProjectArg('zzz', projects), null);
});

test('appendProjectRow inserts before the Add-new-rows marker', () => {
  const out = appendProjectRow(fixture, {
    name: 'New Thing', repoPath: 'D:\\new', type: 'CLI', folder: 'New-Thing', status: 'Active', summary: 'A new thing.',
  });
  const lines = out.split('\n');
  const idx = lines.findIndex((l) => l.startsWith('*(Add new rows'));
  assert.ok(idx > 0);
  assert.match(lines[idx - 2], /^\| New Thing \| `D:\\new` \| CLI \| \[Memory\.md\]\(New-Thing\/Memory\.md\) \| \[DynamicMemory\.md\]\(New-Thing\/DynamicMemory\.md\) \| Active \| A new thing\. \|$/);
  assert.equal(parseProjectsIndex(out, memoryRoot).length, 7);
});

test('appendProjectRow without a marker appends after the last table row', () => {
  const md = '| Project | Path (local repo) | Memory |\n|---|---|---|\n| X | `D:\\x` | [Memory.md](X/Memory.md) |\n\nTrailing text\n';
  const out = appendProjectRow(md, { name: 'Y', repoPath: 'D:\\y', type: '', folder: 'Y', status: '', summary: '' });
  assert.equal(parseProjectsIndex(out, memoryRoot).length, 2);
  assert.ok(out.indexOf('| Y |') < out.indexOf('Trailing text'));
});
