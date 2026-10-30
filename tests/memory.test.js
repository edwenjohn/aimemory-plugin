'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  parseEntries, lastEntries, extractEntryTemplate, dominantLevel, detectEol,
  appendEntry, appendToLastEntry, buildMemoryPayload, renderStub,
} = require('../scripts/lib/memory');

const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n), 'utf8');
const dynH3 = fx('dyn-h3.md');
const dynH2 = fx('dyn-h2.md');
const memLarge = fx('memory-large.md');

function tmpCopy(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aimemory-mem-'));
  const file = path.join(dir, 'DynamicMemory.md');
  fs.writeFileSync(file, content);
  return file;
}

test('parseEntries finds the h3 entries of the real log with dates and headings', () => {
  const es = parseEntries(dynH3);
  assert.equal(es.length, 10);
  assert.equal(es[0].level, 3);
  assert.equal(es[0].date, '2026-10-02');
  assert.match(es[0].heading, /^Framework rebuilt on F:/);
  assert.ok(es[0].text.includes('**Project:**'));
  assert.ok(es.every((e) => e.isStub === false));
});

test('a dated heading inside a fenced block is not an entry (Review Focus 4)', () => {
  const md = '# Log\n\n### Entry template\n\n```\n### 2026-01-01 — example entry [Claude Code]\n**Project:** X\n```\n\n## Log\n\n### 2026-02-02 — real one [Codex]\nbody\n';
  const es = parseEntries(md);
  assert.equal(es.length, 1);
  assert.equal(es[0].date, '2026-02-02');
  assert.equal(es[0].heading, 'real one [Codex]');
});

test('entries run to the next entry heading or end of file; h2 file parses too', () => {
  const es = parseEntries(dynH2);
  assert.equal(es.length, 3);
  assert.equal(es[0].level, 2);
  assert.equal(es[0].date, '2026-07-30');
  assert.equal(es[2].end, dynH2.split(/\r?\n/).length);
});

test('lastEntries returns the bottom-most N in file order', () => {
  const all = parseEntries(dynH3);
  const last3 = lastEntries(dynH3, 3);
  assert.equal(last3.length, 3);
  assert.deepEqual(last3.map((e) => e.heading), all.slice(-3).map((e) => e.heading));
  assert.equal(lastEntries(dynH3, 50).length, 10);
});

test('extractEntryTemplate returns the fenced block after the Entry template heading', () => {
  const t = extractEntryTemplate(dynH3);
  assert.ok(t.startsWith('### YYYY-MM-DD — <short title>'));
  assert.ok(t.includes('**Follow-up:**'));
  assert.ok(!t.includes('```'));
  assert.equal(extractEntryTemplate(dynH2), null);
});

test('dominantLevel: 3 for a file with ## Log, 2 for the Namba log', () => {
  assert.equal(dominantLevel(dynH3), 3);
  assert.equal(dominantLevel(dynH2), 2);
  assert.equal(dominantLevel(''), 2);
});

test('detectEol', () => {
  assert.equal(detectEol(dynH3), '\r\n');
  assert.equal(detectEol(dynH2), '\n');
  assert.equal(detectEol('no newline'), '\n');
});

test('appendEntry preserves CRLF and leaves exactly one blank line before the entry (Review Focus 4)', () => {
  const file = tmpCopy(dynH3);
  appendEntry(file, '### 2026-10-30 — Added thing [Claude Code]\n**Project:** X\n**Status:** done');
  const out = fs.readFileSync(file, 'utf8');
  assert.ok(/\S\r\n\r\n### 2026-10-30 — Added thing \[Claude Code\]\r\n\*\*Project:\*\* X\r\n\*\*Status:\*\* done\r\n$/.test(out), 'entry separated by one blank CRLF line and terminated');
  assert.ok(!out.includes('\n\n\n'));
  assert.ok(!/[^\r]\n/.test(out), 'no bare LF introduced');
  assert.equal(parseEntries(out).length, 11);
});

test('appendEntry on a file without trailing newline and on an empty file', () => {
  const f1 = tmpCopy('## 2026-01-01 — a\nbody');
  appendEntry(f1, '## 2026-01-02 — b\nmore');
  assert.equal(fs.readFileSync(f1, 'utf8'), '## 2026-01-01 — a\nbody\n\n## 2026-01-02 — b\nmore\n');
  const f2 = tmpCopy('');
  appendEntry(f2, '## 2026-01-02 — b');
  assert.equal(fs.readFileSync(f2, 'utf8'), '## 2026-01-02 — b\n');
});

test('appendToLastEntry extends only when the heading is the last entry', () => {
  const file = tmpCopy('## 2026-01-01 — first [Codex]\nbody\n\n## 2026-01-02 — second [Codex]\n**Changed:** a.js\n');
  assert.equal(appendToLastEntry(file, 'first [Codex]', ['**Follow-up:** nope']), false);
  assert.equal(fs.readFileSync(file, 'utf8').includes('nope'), false);
  assert.equal(appendToLastEntry(file, 'second [Codex]', ['**Changed:** b.js', '**Follow-up:** check']), true);
  const out = fs.readFileSync(file, 'utf8');
  assert.ok(out.endsWith('**Changed:** a.js\n**Changed:** b.js\n**Follow-up:** check\n'));
  assert.equal(parseEntries(out).length, 2);
});

test('buildMemoryPayload inlines the whole file under the limit', () => {
  const r = buildMemoryPayload(memLarge, 40000);
  assert.equal(r.truncated, false);
  assert.equal(r.text, memLarge);
});

test('buildMemoryPayload over the limit keeps TL;DR, the heading list and the Security section', () => {
  const r = buildMemoryPayload(memLarge, 12000);
  assert.equal(r.truncated, true);
  assert.ok(r.text.length < memLarge.length);
  assert.ok(r.text.includes('## 1. TL;DR'));
  assert.ok(r.text.includes('## 9. Security and safety constraints (non-negotiable)'));
  assert.ok(r.text.includes('- 7. The three sales sources'), 'heading list present');
  assert.ok(!r.text.includes('## 2. Layout\n'), 'ordinary sections are not inlined');
  assert.match(r.text, /aimemory:pull|\$aimemory-pull|pull/);
});

test('buildMemoryPayload over the limit without a TL;DR falls back to the first section', () => {
  const md = '# Title\n\nintro\n\n## Alpha\n\nalpha body\n\n## Beta\n\nbeta body\n';
  const r = buildMemoryPayload(md, 10);
  assert.ok(r.text.includes('## Alpha'));
  assert.ok(r.text.includes('alpha body'));
  assert.ok(!r.text.includes('beta body'));
});

test('renderStub contains [auto-stub], the file list, tool and session id at the requested level', () => {
  const s = renderStub({ date: '2026-10-30', level: 3, files: ['a.php', 'b.css'], tool: 'claude', sessionId: '1a2b3c4d5e6f' });
  assert.ok(s.startsWith('### 2026-10-30 — [auto-stub] session ended with unlogged changes'));
  assert.ok(s.includes('a.php, b.css'));
  assert.ok(s.includes('Claude Code'));
  assert.ok(s.includes('1a2b3c4d'));
  assert.ok(s.includes('Expand or correct this entry'));
  const s2 = renderStub({ date: '2026-10-30', level: 2, files: [], tool: 'codex', sessionId: 'x' });
  assert.ok(s2.startsWith('## 2026-10-30 — [auto-stub]'));
  assert.ok(s2.includes('Codex'));
  assert.equal(parseEntries(s2)[0].isStub, true);
});
