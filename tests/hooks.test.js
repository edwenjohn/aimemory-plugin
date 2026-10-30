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
let plainDir;
before(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'aimemory-hooks-'));
  process.env.AIMEMORY_HOME = home;
  // A memory root with one real-looking project pointing at a temp repo dir.
  memoryRoot = path.join(home, 'mem');
  repoDir = path.join(home, 'repo', 'summitpharma-child');
  plainDir = path.join(home, 'plain');
  fs.mkdirSync(path.join(memoryRoot, 'SummitPharma-Child-Theme'), { recursive: true });
  fs.mkdirSync(path.join(memoryRoot, 'Namba-AI-Framework'), { recursive: true });
  fs.mkdirSync(repoDir, { recursive: true });
  fs.mkdirSync(plainDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'package.json'), '{}');
  const projectsMd = fx('Projects.md')
    .replace('`c:\\wamp64\\www\\summitpharma\\wp-content\\themes\\summitpharma-child`', '`' + repoDir + '`');
  fs.writeFileSync(path.join(memoryRoot, 'Projects.md'), projectsMd);
  fs.writeFileSync(path.join(memoryRoot, 'SummitPharma-Child-Theme', 'Memory.md'), fx('memory-large.md'));
  fs.writeFileSync(path.join(memoryRoot, 'SummitPharma-Child-Theme', 'DynamicMemory.md'), fx('dyn-h3.md'));
  fs.writeFileSync(path.join(memoryRoot, 'Namba-AI-Framework', 'Memory.md'), '# Namba\n\n## 1. TL;DR\n\nsmall\n');
  fs.writeFileSync(path.join(memoryRoot, 'Namba-AI-Framework', 'DynamicMemory.md'), fx('dyn-h2.md'));
});
after(() => {
  delete process.env.AIMEMORY_HOME;
  fs.rmSync(home, { recursive: true, force: true });
});

const { saveConfig, loadConfig } = require('../scripts/lib/config');
const { statePath, loadState, saveState, newState } = require('../scripts/lib/state');
const hooks = require('../scripts/lib/hooks');
const { parseEntries } = require('../scripts/lib/memory');

function run(cmd, input, extraArgs = []) {
  const r = spawnSync(process.execPath, [CLI, cmd, ...extraArgs], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, AIMEMORY_HOME: home },
  });
  return { status: r.status, out: r.stdout, err: r.stderr, json: r.stdout.trim() ? JSON.parse(r.stdout) : null };
}

function configured() {
  fs.rmSync(path.join(home, '.aimemory'), { recursive: true, force: true });
  saveConfig({ memoryRoot });
}

function startInput(tool, cwd, source = 'startup', sessionId = `${tool}-s`) {
  return {
    session_id: sessionId, transcript_path: null, cwd, hook_event_name: 'SessionStart', source,
    permission_mode: 'default', ...(tool === 'codex' ? { model: 'gpt-5-codex' } : {}),
  };
}

function stopInput(tool, cwd, sessionId, extra = {}) {
  return {
    session_id: sessionId, transcript_path: null, cwd, hook_event_name: 'Stop', permission_mode: 'default',
    stop_hook_active: false, last_assistant_message: 'Done. The feature is implemented.', ...extra,
  };
}

beforeEach(() => configured());

// ---------- Review Focus 1: malformed stdin ----------

test('malformed stdin yields {} and exit 0 for every hook command (Review Focus 1)', () => {
  for (const cmd of ['hook-session-start', 'hook-post-tool-use', 'hook-stop', 'hook-session-end']) {
    const r = run(cmd, '{not json', ['--tool', 'claude']);
    assert.equal(r.status, 0, `${cmd} exit`);
    assert.deepEqual(r.json, {}, `${cmd} output`);
  }
  const empty = run('hook-stop', '', ['--tool', 'codex']);
  assert.equal(empty.status, 0);
  assert.deepEqual(empty.json, {});
  assert.ok(fs.existsSync(path.join(home, '.aimemory', 'hooks.log')));
});

// ---------- SessionStart ----------

test('sessionStart without config asks for the path with the tool-specific command', () => {
  fs.rmSync(path.join(home, '.aimemory'), { recursive: true, force: true });
  const c = run('hook-session-start', startInput('claude', repoDir), ['--tool', 'claude']).json;
  assert.match(c.hookSpecificOutput.additionalContext, /no memory path is set/i);
  assert.match(c.hookSpecificOutput.additionalContext, /\/aimemory:path/);
  assert.ok(c.systemMessage);
  const x = run('hook-session-start', startInput('codex', repoDir), ['--tool', 'codex']).json;
  assert.match(x.hookSpecificOutput.additionalContext, /\$aimemory-path/);
  assert.ok(!x.hookSpecificOutput.additionalContext.includes('/aimemory:'));
});

test('sessionStart on a registered project injects Memory.md, the last 8 entries and the protocol, and writes state', () => {
  const r = run('hook-session-start', startInput('claude', path.join(repoDir, 'src'), 'startup', 'reg-1'), ['--tool', 'claude']).json;
  const ctx = r.hookSpecificOutput.additionalContext;
  assert.equal(r.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(ctx, /SummitPharma Child Theme/);
  assert.match(ctx, /## 1\. TL;DR/);
  assert.match(ctx, /## 9\. Security and safety constraints/);
  const entries = parseEntries(fx('dyn-h3.md'));
  assert.ok(ctx.includes(entries[entries.length - 1].heading));
  assert.ok(ctx.includes(entries[entries.length - 8].heading));
  assert.ok(!ctx.includes(entries[entries.length - 9].heading));
  assert.match(ctx, /\/aimemory:save/);
  assert.match(ctx, /append/i);
  const st = loadState('reg-1');
  assert.equal(st.project, 'SummitPharma-Child-Theme');
  assert.equal(st.tool, 'claude');
});

test('sessionStart on compact injects only the TL;DR and the last 3 entries', () => {
  const r = run('hook-session-start', startInput('codex', repoDir, 'compact', 'cmp-1'), ['--tool', 'codex']).json;
  const ctx = r.hookSpecificOutput.additionalContext;
  assert.match(ctx, /## 1\. TL;DR/);
  assert.ok(!ctx.includes('## 2. Layout'));
  const entries = parseEntries(fx('dyn-h3.md'));
  assert.ok(ctx.includes(entries[entries.length - 3].heading));
  assert.ok(!ctx.includes(entries[entries.length - 4].heading));
  assert.match(ctx, /\$aimemory-save/);
});

test('sessionStart flags open [auto-stub] entries', () => {
  const dyn = path.join(memoryRoot, 'Namba-AI-Framework', 'DynamicMemory.md');
  const original = fs.readFileSync(dyn, 'utf8');
  fs.appendFileSync(dyn, '\n## 2026-10-29 — [auto-stub] session ended with unlogged changes\n- Files: x.js\n');
  const nambaRepo = 'C:/Users/AU/Documents/Namba-AI-Framework';
  const r = run('hook-session-start', startInput('claude', nambaRepo, 'startup', 'stub-1'), ['--tool', 'claude']).json;
  assert.match(r.hookSpecificOutput.additionalContext, /auto-stub/);
  assert.match(r.hookSpecificOutput.additionalContext, /expand or correct/i);
  fs.writeFileSync(dyn, original);
});

test('sessionStart with unreachable memoryRoot emits a systemMessage only (Review Focus 2)', () => {
  saveConfig({ memoryRoot: path.join(home, 'gone') });
  const r = run('hook-session-start', startInput('claude', repoDir, 'startup', 'unr-1'), ['--tool', 'claude']).json;
  assert.match(r.systemMessage, /not reachable/i);
  assert.equal(r.hookSpecificOutput, undefined);
});

test('sessionStart in an unregistered folder with package.json suggests init; a plain folder gets nothing', () => {
  const projDir = path.join(home, 'unreg-proj');
  fs.mkdirSync(projDir, { recursive: true });
  fs.writeFileSync(path.join(projDir, 'package.json'), '{}');
  const r = run('hook-session-start', startInput('claude', projDir, 'startup', 'un-1'), ['--tool', 'claude']).json;
  assert.match(r.hookSpecificOutput.additionalContext, /not registered/i);
  assert.match(r.hookSpecificOutput.additionalContext, /\/aimemory:init/);
  const p = run('hook-session-start', startInput('claude', plainDir, 'startup', 'un-2'), ['--tool', 'claude']).json;
  assert.deepEqual(p, {});
  assert.ok(fs.existsSync(statePath('un-2')), 'state is still written for plain folders');
});

// ---------- PostToolUse ----------

test('extractPathsFromToolInput handles Claude file_path/notebook_path and Codex apply_patch (Review Focus 5)', () => {
  const cwd = 'C:/repo';
  assert.deepEqual(hooks.extractPathsFromToolInput('Edit', { file_path: 'C:/repo/a.js' }, cwd), ['C:/repo/a.js']);
  assert.deepEqual(hooks.extractPathsFromToolInput('NotebookEdit', { notebook_path: 'C:/repo/n.ipynb' }, cwd), ['C:/repo/n.ipynb']);
  assert.deepEqual(hooks.extractPathsFromToolInput('Write', { file_path: 'rel/b.js' }, cwd), [path.resolve(cwd, 'rel/b.js')]);
  const patch = JSON.parse(fx('hook-input/codex-post-apply-patch.json'));
  const got = hooks.extractPathsFromToolInput(patch.tool_name, patch.tool_input, patch.cwd).map((p) => p.replace(/\\/g, '/'));
  assert.deepEqual(got, [
    'C:/wamp64/www/summitpharma/wp-content/themes/summitpharma-child/src/Classes/Manager.php',
    'C:/wamp64/www/summitpharma/wp-content/themes/summitpharma-child/assets/js/new-feature.js',
    'C:/wamp64/www/summitpharma/wp-content/themes/summitpharma-child/assets/js/old.js',
    'C:/wamp64/www/summitpharma/wp-content/themes/summitpharma-child/assets/css/shop.min.css',
  ]);
  assert.deepEqual(hooks.extractPathsFromToolInput('Bash', { command: 'ls' }, cwd), []);
});

test('postToolUse records Claude Edit file_path against the detected project and ignores minified files', () => {
  run('hook-session-start', startInput('claude', repoDir, 'startup', 'ptu-1'), ['--tool', 'claude']);
  const edit = JSON.parse(fx('hook-input/claude-post-edit.json'));
  edit.session_id = 'ptu-1'; edit.cwd = repoDir;
  edit.tool_input.file_path = path.join(repoDir, 'functions.php');
  assert.deepEqual(run('hook-post-tool-use', edit, ['--tool', 'claude']).json, {});
  const min = { ...edit, tool_name: 'Write', tool_input: { file_path: path.join(repoDir, 'assets', 'shop.min.css') } };
  run('hook-post-tool-use', min, ['--tool', 'claude']);
  const st = loadState('ptu-1');
  assert.equal(st.changes['SummitPharma-Child-Theme'].length, 1);
  assert.equal(st.saved['SummitPharma-Child-Theme'], false);
});

test('postToolUse without prior SessionStart creates state on the fly', () => {
  const edit = JSON.parse(fx('hook-input/claude-post-edit.json'));
  edit.session_id = 'ptu-nostart'; edit.cwd = repoDir; edit.tool_input.file_path = path.join(repoDir, 'a.php');
  run('hook-post-tool-use', edit, ['--tool', 'claude']);
  assert.equal(loadState('ptu-nostart').changes['SummitPharma-Child-Theme'].length, 1);
});

// ---------- Stop ----------

function stateWithChange(sessionId, tool = 'claude', folder = 'SummitPharma-Child-Theme') {
  const s = newState({ sessionId, tool, cwd: repoDir, project: folder });
  s.changes[folder] = [path.join(repoDir, 'functions.php').toLowerCase()];
  s.saved[folder] = false;
  saveState(s);
  return s;
}

test('stop: no state or no changes allows', () => {
  assert.deepEqual(run('hook-stop', stopInput('claude', repoDir, 'none'), ['--tool', 'claude']).json, {});
  saveState(newState({ sessionId: 'clean', tool: 'claude', cwd: repoDir, project: 'SummitPharma-Child-Theme' }));
  assert.deepEqual(run('hook-stop', stopInput('claude', repoDir, 'clean'), ['--tool', 'claude']).json, {});
});

test('stop: registered unsaved changes block with a reason naming the project, file count and DynamicMemory path', () => {
  stateWithChange('blk-1');
  const r = run('hook-stop', stopInput('claude', repoDir, 'blk-1'), ['--tool', 'claude']).json;
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /SummitPharma-Child-Theme/);
  assert.match(r.reason, /1 file/);
  assert.match(r.reason, /functions\.php/);
  assert.ok(r.reason.includes(path.join(memoryRoot, 'SummitPharma-Child-Theme', 'DynamicMemory.md')));
  assert.match(r.reason, /\/aimemory:save/);
  assert.equal(loadState('blk-1').blockedOnce, true);
});

test('stop: stop_hook_active, paused, autoSave off, and a trailing question all allow', () => {
  stateWithChange('act-1');
  assert.deepEqual(run('hook-stop', stopInput('claude', repoDir, 'act-1', { stop_hook_active: true }), ['--tool', 'claude']).json, {});
  assert.deepEqual(run('hook-stop', stopInput('claude', repoDir, 'act-1', { last_assistant_message: 'Should I also update the CSS?' }), ['--tool', 'claude']).json, {});
  const s = stateWithChange('pau-1'); s.paused = true; saveState(s);
  assert.deepEqual(run('hook-stop', stopInput('claude', repoDir, 'pau-1'), ['--tool', 'claude']).json, {});
  stateWithChange('off-1');
  saveConfig({ autoSave: 'off' });
  assert.deepEqual(run('hook-stop', stopInput('claude', repoDir, 'off-1'), ['--tool', 'claude']).json, {});
});

test('stop: remind mode returns additionalContext instead of a block', () => {
  stateWithChange('rem-1', 'codex');
  saveConfig({ autoSave: 'remind' });
  const r = run('hook-stop', stopInput('codex', repoDir, 'rem-1'), ['--tool', 'codex']).json;
  assert.equal(r.decision, undefined);
  assert.equal(r.hookSpecificOutput.hookEventName, 'Stop');
  assert.match(r.hookSpecificOutput.additionalContext, /SummitPharma-Child-Theme/);
  assert.match(r.hookSpecificOutput.additionalContext, /\$aimemory-save/);
});

test('stop: unreachable root emits systemMessage once and never blocks (Review Focus 2)', () => {
  stateWithChange('unr-stop');
  saveConfig({ memoryRoot: path.join(home, 'gone') });
  const first = run('hook-stop', stopInput('claude', repoDir, 'unr-stop'), ['--tool', 'claude']).json;
  assert.equal(first.decision, undefined);
  assert.match(first.systemMessage, /not reachable/i);
  const second = run('hook-stop', stopInput('claude', repoDir, 'unr-stop'), ['--tool', 'claude']).json;
  assert.deepEqual(second, {});
});

test('stop: only unregistered changes emits a systemMessage once', () => {
  const s = newState({ sessionId: 'unreg-stop', tool: 'claude', cwd: plainDir, project: null });
  s.changes._unregistered = ['c:/plain/x.js'];
  saveState(s);
  const first = run('hook-stop', stopInput('claude', plainDir, 'unreg-stop'), ['--tool', 'claude']).json;
  assert.match(first.systemMessage, /aimemory:init/);
  assert.equal(first.decision, undefined);
  assert.deepEqual(run('hook-stop', stopInput('claude', plainDir, 'unreg-stop'), ['--tool', 'claude']).json, {});
});

// ---------- SessionEnd ----------

test('sessionEnd appends an [auto-stub] at the dominant level and deletes state', () => {
  const dyn = path.join(memoryRoot, 'SummitPharma-Child-Theme', 'DynamicMemory.md');
  const before = fs.readFileSync(dyn, 'utf8');
  stateWithChange('end-1', 'codex');
  const r = run('hook-session-end', { session_id: 'end-1', cwd: repoDir, hook_event_name: 'SessionEnd', reason: 'other' }, ['--tool', 'codex']).json;
  assert.deepEqual(r, {});
  const after = fs.readFileSync(dyn, 'utf8');
  const es = parseEntries(after);
  assert.equal(es[es.length - 1].isStub, true);
  assert.equal(es[es.length - 1].level, 3);
  assert.match(es[es.length - 1].text, /functions\.php/);
  assert.match(es[es.length - 1].text, /Codex/);
  assert.ok(after.startsWith(before.replace(/(\r?\n)+$/, '')));
  assert.equal(fs.existsSync(statePath('end-1')), false);
  fs.writeFileSync(dyn, before);
});

test('sessionEnd writes no stub when saved, when nothing changed, or when the root is unreachable', () => {
  const dyn = path.join(memoryRoot, 'SummitPharma-Child-Theme', 'DynamicMemory.md');
  const before = fs.readFileSync(dyn, 'utf8');
  const s = stateWithChange('end-saved'); s.saved['SummitPharma-Child-Theme'] = true; saveState(s);
  run('hook-session-end', { session_id: 'end-saved', cwd: repoDir, hook_event_name: 'SessionEnd' }, ['--tool', 'claude']);
  saveState(newState({ sessionId: 'end-clean', tool: 'claude', cwd: repoDir, project: 'SummitPharma-Child-Theme' }));
  run('hook-session-end', { session_id: 'end-clean', cwd: repoDir, hook_event_name: 'SessionEnd' }, ['--tool', 'claude']);
  assert.equal(fs.readFileSync(dyn, 'utf8'), before);
  assert.equal(fs.existsSync(statePath('end-saved')), false);
  stateWithChange('end-unr');
  saveConfig({ memoryRoot: path.join(home, 'gone') });
  assert.deepEqual(run('hook-session-end', { session_id: 'end-unr', cwd: repoDir, hook_event_name: 'SessionEnd' }, ['--tool', 'claude']).json, {});
  assert.equal(fs.readFileSync(dyn, 'utf8'), before);
});

test('loadConfig sanity for this suite', () => {
  assert.equal(loadConfig().memoryRoot, memoryRoot);
});

// ---------- review fixes ----------

test('stop block reason tells the agent its session id and the exact append-entry command (review C2)', () => {
  stateWithChange('sid-1');
  const r = run('hook-stop', stopInput('claude', repoDir, 'sid-1'), ['--tool', 'claude']).json;
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /Session id: sid-1/);
  assert.match(r.reason, /append-entry --project SummitPharma-Child-Theme --session sid-1 --file/);
  assert.match(r.reason, /UTF-8/);
});

test('sessionStart context carries the session id (review C2)', () => {
  const r = run('hook-session-start', startInput('claude', repoDir, 'startup', 'sid-start'), ['--tool', 'claude']).json;
  assert.match(r.hookSpecificOutput.additionalContext, /Session id: sid-start/);
  const c = run('hook-session-start', startInput('codex', repoDir, 'compact', 'sid-compact'), ['--tool', 'codex']).json;
  assert.match(c.hookSpecificOutput.additionalContext, /Session id: sid-compact/);
});

test('the temp entry file a save writes is never recorded as a change (review: spurious unregistered warning)', () => {
  run('hook-session-start', startInput('claude', repoDir, 'startup', 'tmp-1'), ['--tool', 'claude']);
  const w = {
    session_id: 'tmp-1', cwd: repoDir, hook_event_name: 'PostToolUse', tool_name: 'Write',
    tool_input: { file_path: path.join(os.tmpdir(), 'aimemory-entry-smoke.md'), content: '### x' },
  };
  run('hook-post-tool-use', w, ['--tool', 'claude']);
  const st = loadState('tmp-1');
  assert.deepEqual(st.changes, {});
});
