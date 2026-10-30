'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.join(__dirname, '..', 'skills');
const EXPECTED = ['pull', 'save', 'update', 'path', 'init', 'list', 'search', 'pause', 'status'];

function frontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(md);
  return m ? m[1] : null;
}

test('all nine skills exist', () => {
  for (const name of EXPECTED) {
    assert.ok(fs.existsSync(path.join(SKILLS, name, 'SKILL.md')), `skills/${name}/SKILL.md missing`);
  }
});

test('every skill has description-only frontmatter, is <= 80 lines, and references aimemory.js via CLAUDE_PLUGIN_ROOT', () => {
  for (const name of EXPECTED) {
    const file = path.join(SKILLS, name, 'SKILL.md');
    const md = fs.readFileSync(file, 'utf8');
    const fm = frontmatter(md);
    assert.ok(fm, `${name}: frontmatter missing`);
    assert.match(fm, /^description: .{40,}/m, `${name}: description too short`);
    assert.ok(!/^name:/m.test(fm), `${name}: must not set name (Claude Code derives /aimemory:${name} from the directory)`);
    assert.ok(md.split(/\r?\n/).length <= 80, `${name}: over 80 lines`);
    assert.ok(md.includes('${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js'), `${name}: must call aimemory.js via \${CLAUDE_PLUGIN_ROOT}`);
    assert.ok(!md.includes('$aimemory-'), `${name}: Codex spelling belongs to the generated copy only`);
    assert.ok(!md.includes('${PLUGIN_ROOT}'), `${name}: Codex variable belongs to the generated copy only`);
  }
});

test('save and init skills carry the agent tag and template rules', () => {
  const save = fs.readFileSync(path.join(SKILLS, 'save', 'SKILL.md'), 'utf8');
  assert.match(save, /\[Claude Code\]/);
  assert.match(save, /--extend/);
  assert.match(save, /append-entry/);
  assert.match(save, /template/i);
  const init = fs.readFileSync(path.join(SKILLS, 'init', 'SKILL.md'), 'utf8');
  assert.match(init, /memory-template\.md/);
  assert.match(init, /init --name/);
});

test('protocol.md and the templates exist, are non-empty, and protocol.md uses {{skill}} placeholders', () => {
  const refs = path.join(SKILLS, '_references');
  for (const f of ['protocol.md', 'entry-format.md', 'memory-template.md', 'dynamic-template.md', 'projects-template.md', 'readme-template.md']) {
    const text = fs.readFileSync(path.join(refs, f), 'utf8');
    assert.ok(text.trim().length > 100, `${f} is empty`);
  }
  const protocol = fs.readFileSync(path.join(refs, 'protocol.md'), 'utf8');
  assert.match(protocol, /\{\{save\}\}/);
  assert.match(protocol, /\{\{pull\}\}/);
  assert.ok(!protocol.includes('/aimemory:'), 'protocol.md must use placeholders, not a tool-specific spelling');
});

test('the protocol summary used by hooks substitutes placeholders per tool', () => {
  const { protocolSummary } = require('../scripts/lib/hooks');
  const c = protocolSummary('claude', null);
  const x = protocolSummary('codex', null);
  assert.match(c, /\/aimemory:save/);
  assert.ok(!c.includes('{{'));
  assert.match(x, /\$aimemory-save/);
  assert.ok(!x.includes('/aimemory:'));
});
