'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build, isStale, transformSkill } = require('../scripts/build-codex-skills');

const ROOT = path.join(__dirname, '..');
const DIRS = ['pull', 'save', 'update', 'path', 'init', 'list', 'search', 'pause', 'status'];

test('transformSkill adds the Codex name, rewrites commands, variables and the agent tag', () => {
  const src = '---\ndescription: Does things. Use when asked.\n---\n\nRun `node "${CLAUDE_PLUGIN_ROOT}/scripts/aimemory.js" x` then /aimemory:save and /aimemory:pull. Tag [Claude Code].\n';
  const out = transformSkill('save', src);
  assert.ok(out.startsWith('---\nname: aimemory-save\ndescription: Does things. Use when asked.\n---\n'));
  assert.ok(out.includes('${PLUGIN_ROOT}/scripts/aimemory.js'));
  assert.ok(out.includes('$aimemory-save and $aimemory-pull'));
  assert.ok(out.includes('[Codex]'));
  assert.ok(!out.includes('/aimemory:'));
  assert.ok(!out.includes('CLAUDE_PLUGIN_ROOT'));
});

test('generated codex-skills are committed and not stale', () => {
  assert.equal(isStale(), false, 'run `npm run build` and commit the result');
  for (const dir of DIRS) {
    const file = path.join(ROOT, 'codex-skills', dir, 'SKILL.md');
    assert.ok(fs.existsSync(file), `${file} missing`);
    const md = fs.readFileSync(file, 'utf8');
    assert.match(md, new RegExp(`^---\\nname: aimemory-${dir}\\n`), `${dir}: name`);
    assert.ok(!md.includes('/aimemory:'), `${dir}: Claude spelling left behind`);
    assert.ok(!md.includes('CLAUDE_PLUGIN_ROOT'), `${dir}: Claude variable left behind`);
    assert.ok(md.includes('${PLUGIN_ROOT}/scripts/aimemory.js'), `${dir}: Codex variable`);
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'codex-skills', 'save', 'SKILL.md'), 'utf8'), /\[Codex\]/);
  for (const ref of fs.readdirSync(path.join(ROOT, 'skills', '_references'))) {
    assert.equal(
      fs.readFileSync(path.join(ROOT, 'codex-skills', '_references', ref), 'utf8'),
      fs.readFileSync(path.join(ROOT, 'skills', '_references', ref), 'utf8'),
      `_references/${ref} differs`,
    );
  }
});

test('build returns the list of written files and is idempotent', () => {
  const first = build();
  assert.ok(first.length >= DIRS.length);
  assert.deepEqual(build(), first);
  assert.equal(isStale(), false);
});
