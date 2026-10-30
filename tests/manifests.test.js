'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const HOOK_COMMANDS = ['hook-session-start', 'hook-post-tool-use', 'hook-stop', 'hook-session-end'];
const EVENT_TO_COMMAND = { SessionStart: 'hook-session-start', PostToolUse: 'hook-post-tool-use', Stop: 'hook-stop', SessionEnd: 'hook-session-end' };

test('Claude Code manifest and marketplace', () => {
  const m = read('.claude-plugin/plugin.json');
  assert.equal(m.name, 'aimemory');
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
  assert.ok(m.description.length > 20);
  assert.equal(m.hooks, './hooks/claude.json');
  const mk = read('.claude-plugin/marketplace.json');
  assert.equal(mk.name, 'aimemory');
  assert.ok(mk.owner && mk.owner.name);
  assert.equal(mk.plugins.length, 1);
  assert.equal(mk.plugins[0].name, 'aimemory');
  assert.equal(mk.plugins[0].source, './');
  assert.equal(mk.plugins[0].version, m.version);
});

test('Codex portable manifest, compatibility manifest and repo marketplace', () => {
  const portable = read('plugin.json');
  assert.equal(portable.name, 'aimemory');
  assert.match(portable.version, /^\d+\.\d+\.\d+$/);
  assert.ok(portable.$schema.includes('agent-plugins.org'));
  assert.equal(portable.extensions, undefined, 'the compat overlay must be the source of OpenAI settings');
  const compat = read('.codex-plugin/plugin.json');
  assert.equal(compat.name, 'aimemory');
  assert.equal(compat.version, portable.version);
  assert.equal(compat.skills, './codex-skills/');
  assert.equal(compat.hooks, './hooks/codex.json');
  assert.equal(compat.onboardingSkill, './codex-skills/path/SKILL.md');
  assert.ok(fs.existsSync(path.join(ROOT, compat.onboardingSkill)));
  assert.equal(compat.interface.displayName, 'AI Memory');
  assert.equal(compat.interface.category, 'Productivity');
  const mk = read('.agents/plugins/marketplace.json');
  assert.equal(mk.plugins[0].name, 'aimemory');
  assert.deepEqual(mk.plugins[0].source, { source: 'local', path: './' });
  assert.equal(mk.plugins[0].policy.installation, 'AVAILABLE');
  assert.equal(read('.claude-plugin/plugin.json').version, portable.version, 'all manifests share one version');
});

function checkHooks(file, tool, postMatcher, rootVar) {
  const h = read(file).hooks;
  assert.deepEqual(Object.keys(h).sort(), ['PostToolUse', 'SessionEnd', 'SessionStart', 'Stop']);
  assert.equal(h.SessionStart[0].matcher, 'startup|resume|clear|compact');
  assert.equal(h.PostToolUse[0].matcher, postMatcher);
  for (const [event, groups] of Object.entries(h)) {
    for (const g of groups) {
      for (const hook of g.hooks) {
        assert.equal(hook.type, 'command');
        assert.ok(hook.command.includes(`${rootVar}/scripts/aimemory.js`), `${file} ${event}: root variable`);
        assert.ok(hook.command.includes(` ${EVENT_TO_COMMAND[event]} `), `${file} ${event}: command`);
        assert.ok(hook.command.endsWith(`--tool ${tool}`), `${file} ${event}: --tool`);
        assert.ok(hook.command.startsWith('node "'), `${file} ${event}: node with quoted path`);
        assert.ok(Number.isInteger(hook.timeout) && hook.timeout > 0 && hook.timeout <= 30, `${file} ${event}: timeout`);
        const cmd = /hook-[a-z-]+/.exec(hook.command)[0];
        assert.ok(HOOK_COMMANDS.includes(cmd), `${cmd} is not a dispatcher case`);
      }
    }
  }
}

test('hooks/claude.json', () => {
  checkHooks('hooks/claude.json', 'claude', 'Edit|Write|MultiEdit|NotebookEdit', '${CLAUDE_PLUGIN_ROOT}');
});

test('hooks/codex.json', () => {
  checkHooks('hooks/codex.json', 'codex', 'apply_patch|Edit|Write', '${PLUGIN_ROOT}');
  const h = read('hooks/codex.json').hooks;
  assert.ok(h.SessionStart[0].hooks[0].statusMessage);
});

test('every hook command in the dispatcher is reachable from the CLI source', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'aimemory.js'), 'utf8');
  for (const c of HOOK_COMMANDS) assert.ok(src.includes(`'${c}'`), c);
});
