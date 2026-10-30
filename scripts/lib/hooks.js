'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { loadConfig, memoryRootReachable } = require('./config');
const { parseProjectsIndex, detectProject } = require('./projects');
const {
  parseEntries, lastEntries, appendEntry, buildMemoryPayload, dominantLevel, renderStub, sections, extractEntryTemplate,
} = require('./memory');

const DEFAULT_TEMPLATE = [
  '### YYYY-MM-DD — <short title> [<agent: Claude Code | Codex | other>]',
  '**Project:** <Project folder name>',
  '**Prompt/Task:** one line on what was asked',
  '**Changed:** files touched (path:line if relevant)',
  '**Why:** the reason/context behind the change (business or technical)',
  '**Status:** done | in progress | blocked — <detail if blocked>',
  '**Follow-up:** anything the next session should know or pick up (omit if none)',
].join('\n');

/** The project's own Entry template from its DynamicMemory.md, else the framework default. */
function entryTemplateFor(project) {
  const md = project && project.dynamicFile ? readIfExists(project.dynamicFile) : '';
  return extractEntryTemplate(md) || DEFAULT_TEMPLATE;
}
const {
  newState, loadState, saveState, deleteState, updateState, recordChange, unsavedProjects, sweep,
} = require('./state');
const { logInfo } = require('./log');

const TOOL_LABEL = { claude: 'Claude Code', codex: 'Codex' };
/** Absolute path of the CLI, so hook output can quote a command the agent can run from any shell. */
const CLI_PATH = path.resolve(__dirname, '..', 'aimemory.js').replace(/\\/g, '/');

function sessionLine(sessionId) {
  return `- Session id: ${sessionId || 'unknown'} (pass it as --session to aimemory commands such as save, pause and status).`;
}

/** Tool-specific spelling of a skill command. */
function cmd(tool, skill) {
  return tool === 'codex' ? `$aimemory-${skill}` : `/aimemory:${skill}`;
}

function readIfExists(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function loadProjects(cfg) {
  if (!cfg || !cfg.memoryRoot) return [];
  return parseProjectsIndex(readIfExists(path.join(cfg.memoryRoot, 'Projects.md')), cfg.memoryRoot);
}

/** Heuristic: does this folder look like a code project worth registering? */
function looksLikeProject(dir) {
  try {
    const names = fs.readdirSync(dir);
    if (names.some((n) => ['.git', 'package.json', 'composer.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'].includes(n))) return true;
    if (names.some((n) => n.endsWith('.sln') || n.endsWith('.csproj'))) return true;
    if (names.includes('style.css') && /Theme Name:/i.test(readIfExists(path.join(dir, 'style.css')).slice(0, 2000))) return true;
  } catch { /* unreadable */ }
  return false;
}

function protocolSummary(tool, project) {
  const file = path.join(__dirname, '..', '..', 'skills', '_references', 'protocol.md');
  let text = readIfExists(file);
  if (!text) {
    text = [
      '## AI Memory Framework protocol (aimemory plugin)',
      '- Memory.md above is the stable project reference. Verify exact files and functions before changing code; it can be stale.',
      '- DynamicMemory.md entries above are the recent work log, newest last.',
      '- After meaningful work (any file changed), append one entry to DynamicMemory.md using its own Entry template: run {{save}}. The Stop hook blocks you from finishing a turn with unlogged changes until you do. Never edit earlier entries.',
      '- If Memory.md is stale or wrong, correct it in place with {{update}}.',
      '- Full memory for this or another project: {{pull}}. Troubleshooting: {{status}}. Pause auto-save for this session: {{pause}}.',
    ].join('\n');
  }
  text = text.replace(/\{\{(\w+)\}\}/g, (_, skill) => cmd(tool, skill));
  if (project) {
    text += `\n- Project: "${project.name}" (folder ${project.folder}). Files: ${project.memoryFile} and ${project.dynamicFile}.`;
  }
  return text;
}

/** Spec §6.3 payload. `source: "compact"` gives the short form. */
function buildContext({ project, memoryMd, dynamicMd, cfg, source, tool, sessionId }) {
  const parts = [];
  const stubs = parseEntries(dynamicMd).filter((e) => e.isStub);
  if (source === 'compact') {
    const secs = sections(memoryMd);
    const lead = secs.find((s) => /tl;dr/i.test(s.heading)) || secs[0];
    parts.push(`# AI memory for ${project.name} (after compaction: short form)`);
    if (lead) parts.push(lead.text);
    const last = lastEntries(dynamicMd, 3);
    if (last.length) parts.push('## Last 3 DynamicMemory.md entries\n\n' + last.map((e) => e.text).join('\n\n'));
  } else {
    parts.push(`# AI memory for ${project.name}`);
    const payload = buildMemoryPayload(memoryMd, cfg.memoryInlineLimit);
    parts.push(payload.text || '(Memory.md is empty)');
    const last = lastEntries(dynamicMd, cfg.pullEntries);
    parts.push(`## Last ${last.length} DynamicMemory.md entries\n\n` + (last.length ? last.map((e) => e.text).join('\n\n') : '(no entries yet)'));
  }
  if (stubs.length) {
    parts.push(`## Open [auto-stub] entries (${stubs.length})\nThe plugin wrote these when a session ended with unlogged changes. Expand or correct them first, then continue:\n` + stubs.map((e) => `- ${e.date} — ${e.heading}`).join('\n'));
  }
  parts.push(protocolSummary(tool, project) + '\n' + sessionLine(sessionId));
  return parts.join('\n\n');
}

function sessionStartOutput(text, systemMessage) {
  const out = { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } };
  if (systemMessage) out.systemMessage = systemMessage;
  return out;
}

function sessionStart(input, deps = {}) {
  const tool = deps.tool || 'claude';
  const cfg = loadConfig();
  const cwd = input.cwd || process.cwd();
  if (!cfg || !cfg.memoryRoot) {
    const msg = `aimemory is installed but no memory path is set. Ask the user where the AI Memory Framework folder lives (suggest a folder named "AI Memory Framework" if one exists on a drive root or in Documents), then run ${cmd(tool, 'path')} with that path. Until then, no project memory is loaded.`;
    return sessionStartOutput(msg, 'aimemory: no memory path set. Run ' + cmd(tool, 'path') + ' <folder>.');
  }
  sweep(7);
  if (!memoryRootReachable(cfg)) {
    updateState(input.session_id, (s) => { s.warnedUnreachable = true; }, () => newState({ sessionId: input.session_id, tool, cwd, project: null }));
    return { systemMessage: `aimemory: memory root ${cfg.memoryRoot} is not reachable (drive unplugged?). Memory was not loaded and nothing will be saved this session.` };
  }
  const projects = loadProjects(cfg);
  const det = detectProject({ cwd, projects, memoryRoot: cfg.memoryRoot });
  const folder = det ? det.project.folder : null;
  updateState(input.session_id, (s) => { s.cwd = cwd; s.project = folder; }, () => newState({ sessionId: input.session_id, tool, cwd, project: folder }));
  if (!det) {
    if (looksLikeProject(cwd)) {
      return sessionStartOutput(`This folder is not registered in the AI Memory Framework (${cfg.memoryRoot}). If it is a project worth remembering, run ${cmd(tool, 'init')} to register it; otherwise ignore this.`);
    }
    return {};
  }
  const memoryMd = readIfExists(det.project.memoryFile);
  const dynamicMd = readIfExists(det.project.dynamicFile);
  const text = buildContext({ project: det.project, memoryMd, dynamicMd, cfg, source: input.source, tool, sessionId: input.session_id });
  return sessionStartOutput(text, det.warning ? `aimemory: ${det.warning}` : undefined);
}

/** File paths touched by a tool call, absolute. */
function extractPathsFromToolInput(toolName, toolInput, cwd) {
  const out = [];
  const abs = (p) => (path.isAbsolute(p) ? p : path.resolve(cwd || process.cwd(), p));
  if (!toolInput || typeof toolInput !== 'object') return out;
  if (toolName === 'apply_patch') {
    const re = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm;
    let m;
    while ((m = re.exec(String(toolInput.command || ''))) !== null) out.push(abs(m[1].trim()));
    return out;
  }
  if (typeof toolInput.file_path === 'string') out.push(abs(toolInput.file_path));
  if (typeof toolInput.notebook_path === 'string') out.push(abs(toolInput.notebook_path));
  return out;
}

function postToolUse(input, deps = {}) {
  const tool = deps.tool || 'claude';
  const cfg = loadConfig();
  if (!cfg || !memoryRootReachable(cfg)) return {};
  const paths = extractPathsFromToolInput(input.tool_name, input.tool_input, input.cwd);
  if (!paths.length) return {};
  const projects = loadProjects(cfg);
  updateState(
    input.session_id,
    (state) => { for (const p of paths) recordChange(state, p, projects, cfg.ignore, cfg.memoryRoot); },
    () => {
      const det = detectProject({ cwd: input.cwd || process.cwd(), projects, memoryRoot: cfg.memoryRoot });
      return newState({ sessionId: input.session_id, tool, cwd: input.cwd, project: det ? det.project.folder : null });
    },
  );
  return {};
}

function describeUnsaved(unsaved, projects) {
  return unsaved.map(({ folder, files }) => {
    const p = projects.find((x) => x.folder === folder);
    const shown = files.slice(0, 8).map((f) => path.basename(f)).join(', ') + (files.length > 8 ? `, +${files.length - 8} more` : '');
    return `${folder} (${files.length} file${files.length === 1 ? '' : 's'}: ${shown}) → ${p ? p.dynamicFile : folder + '/DynamicMemory.md'}`;
  });
}

function stop(input, deps = {}) {
  const tool = deps.tool || 'claude';
  const cfg = loadConfig();
  if (!cfg) return {};
  const state = loadState(input.session_id);
  if (!state) return {};
  if (cfg.autoSave === 'off' || state.paused) return {};
  if (input.stop_hook_active) return {};
  if (!memoryRootReachable(cfg)) {
    if (state.warnedUnreachable) return {};
    updateState(input.session_id, (s) => { s.warnedUnreachable = true; });
    return { systemMessage: `aimemory: memory root ${cfg.memoryRoot} is not reachable, so this session's changes cannot be logged.` };
  }
  const unsaved = unsavedProjects(state);
  if (!unsaved.length) {
    const unreg = state.changes._unregistered || [];
    if (unreg.length && !state.warnedUnregistered) {
      updateState(input.session_id, (s) => { s.warnedUnregistered = true; });
      return { systemMessage: `aimemory: ${unreg.length} file(s) changed outside any registered project. Run ${cmd(tool, 'init')} if this folder is a project worth remembering.` };
    }
    return {};
  }
  const lastMsg = String(input.last_assistant_message || '').trim();
  if (lastMsg.endsWith('?')) return {};
  const projects = loadProjects(cfg);
  const lines = describeUnsaved(unsaved, projects);
  if (cfg.autoSave === 'remind') {
    return {
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext: `aimemory: you changed files that are not yet logged. Consider running ${cmd(tool, 'save')} for: ${lines.join('; ')}`,
      },
    };
  }
  updateState(input.session_id, (s) => { s.blockedOnce = true; });
  const commands = unsaved.map((u) => {
    const extend = state.entryHeading && state.entryHeading[u.folder] ? ' --extend' : '';
    return `node "${CLI_PATH}" append-entry --project ${u.folder} --session ${input.session_id} --file <path to a UTF-8 file holding the entry>${extend}`;
  });
  const templates = unsaved.map((u) => {
    const p = projects.find((x) => x.folder === u.folder);
    return `Entry template for ${u.folder} (use exactly this shape; today's date; agent tag [${TOOL_LABEL[tool] || tool}]; fill every field from what you actually did, one line for the prompt):\n${entryTemplateFor(p)}`;
  });
  const reason = [
    `You changed files in ${unsaved.map((u) => u.folder).join(', ')} and have not logged the work in the AI Memory Framework.`,
    ...lines.map((l) => `- ${l}`),
    `Session id: ${input.session_id}`,
    ...templates,
    `Write the entry to a temp file named aimemory-entry.md as UTF-8 (${cmd(tool, 'save')} has the full procedure), then run:`,
    ...commands.map((c) => `  ${c}`),
    'Then stop. Do not edit DynamicMemory.md by hand; the command appends it for you.',
  ].join('\n');
  logInfo(`Stop blocked session ${input.session_id} (${tool}) for ${unsaved.map((u) => u.folder).join(',')}`);
  return { decision: 'block', reason };
}

function sessionEnd(input, deps = {}) {
  const tool = deps.tool || 'claude';
  const cfg = loadConfig();
  const state = loadState(input.session_id);
  if (!state) return {};
  if (cfg && memoryRootReachable(cfg)) {
    const projects = loadProjects(cfg);
    const date = (deps.now ? new Date(deps.now) : new Date()).toISOString().slice(0, 10);
    for (const { folder, files } of unsavedProjects(state)) {
      const p = projects.find((x) => x.folder === folder);
      if (!p || !fs.existsSync(p.dynamicFile)) continue;
      const level = dominantLevel(readIfExists(p.dynamicFile));
      appendEntry(p.dynamicFile, renderStub({
        date, level, files: files.map((f) => path.basename(f)), tool: state.tool || tool, sessionId: input.session_id,
      }));
      logInfo(`SessionEnd stub written for ${folder} (session ${input.session_id})`);
    }
  }
  deleteState(input.session_id);
  return {};
}

module.exports = {
  cmd, TOOL_LABEL, loadProjects, looksLikeProject, protocolSummary, buildContext,
  sessionStart, postToolUse, stop, sessionEnd, extractPathsFromToolInput,
};
