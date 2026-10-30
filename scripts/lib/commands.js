'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULTS, loadConfig, saveConfig, memoryRootReachable } = require('./config');
const { normalizePath, isInside } = require('./paths');
const { parseProjectsIndex, detectProject, resolveProjectArg, appendProjectRow } = require('./projects');
const {
  parseEntries, lastEntries, extractEntryTemplate, dominantLevel, appendEntry, appendToLastEntry, buildMemoryPayload,
} = require('./memory');
const { loadState, saveState, unsavedProjects } = require('./state');
const { tailLog } = require('./log');
const { loadProjects } = require('./hooks');

const REFS = path.join(__dirname, '..', '..', 'skills', '_references');
const ENTRY_HEADING_RE = /^(#{2,3}) (\d{4}-\d{2}-\d{2})\s*(?:[—–-]+\s*)?(.*)$/;

function readRef(name) {
  return fs.readFileSync(path.join(REFS, name), 'utf8');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function requireConfig() {
  const cfg = loadConfig();
  if (!cfg || !cfg.memoryRoot) return { error: 'aimemory is not configured. Run the path skill (config set memoryRoot <folder>) first.' };
  if (!memoryRootReachable(cfg)) return { error: `memory root ${cfg.memoryRoot} is not reachable.` };
  return { cfg, projects: loadProjects(cfg) };
}

function rootInfo(root) {
  return {
    gitRepo: fs.existsSync(path.join(root, '.git')),
    projectsIndex: fs.existsSync(path.join(root, 'Projects.md')),
  };
}

// ---------------------------------------------------------------- config

function cmdConfig(args, flags) {
  const [sub, key, value] = args;
  if (sub === 'get' || !sub) {
    const cfg = loadConfig();
    if (!cfg || !cfg.memoryRoot) return { configured: false };
    return { configured: true, ...cfg, ...rootInfo(cfg.memoryRoot) };
  }
  if (sub !== 'set' || !key) return { error: 'usage: config get | config set <key> <value> [--init-root]' };
  switch (key) {
    case 'memoryRoot': {
      const root = path.resolve(String(value || ''));
      if (!value || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
        return { error: `memoryRoot ${value || '(empty)'} does not exist or is not a directory.` };
      }
      if (flags['init-root']) {
        const idx = path.join(root, 'Projects.md');
        const readme = path.join(root, 'README.md');
        if (!fs.existsSync(idx)) fs.writeFileSync(idx, readRef('projects-template.md'), 'utf8');
        if (!fs.existsSync(readme)) fs.writeFileSync(readme, readRef('readme-template.md'), 'utf8');
      }
      const cfg = saveConfig({ memoryRoot: root });
      return { ...cfg, ...rootInfo(root) };
    }
    case 'autoSave': {
      if (!['block', 'remind', 'off'].includes(value)) return { error: 'autoSave must be one of: block, remind, off' };
      return saveConfig({ autoSave: value });
    }
    case 'pullEntries':
    case 'memoryInlineLimit': {
      const n = Number.parseInt(value, 10);
      if (!Number.isFinite(n) || n <= 0) return { error: `${key} must be a positive integer` };
      return saveConfig({ [key]: n });
    }
    case 'ignore': {
      const list = String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
      return saveConfig({ ignore: list.length ? list : [...DEFAULTS.ignore] });
    }
    default:
      return { error: `unknown config key ${key}. Known: memoryRoot, autoSave, pullEntries, memoryInlineLimit, ignore` };
  }
}

// ---------------------------------------------------------------- detect / context / status

function cwdOf(flags) {
  return path.resolve(flags.cwd ? String(flags.cwd) : process.cwd());
}

function cmdDetect(args, flags) {
  const r = requireConfig();
  if (r.error) return r;
  const det = detectProject({ cwd: cwdOf(flags), projects: r.projects, memoryRoot: r.cfg.memoryRoot });
  if (!det) return { project: null };
  const out = { project: det.project, method: det.method };
  if (det.warning) out.warning = det.warning;
  return out;
}

function pickProject(args, flags, r) {
  const arg = args[0];
  if (arg) {
    const res = resolveProjectArg(arg, r.projects);
    if (!res) return { error: `no project matches "${arg}". Run list to see the registered projects.` };
    if (res.ambiguous) return { ambiguous: res.ambiguous };
    return { project: res.project };
  }
  const det = detectProject({ cwd: cwdOf(flags), projects: r.projects, memoryRoot: r.cfg.memoryRoot });
  if (!det) return { error: `${cwdOf(flags)} is not registered in the AI Memory Framework. Pass a project name, or run init to register this folder.` };
  return { project: det.project, method: det.method, warning: det.warning };
}

function readIfExists(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function cmdContext(args, flags) {
  const r = requireConfig();
  if (r.error) return r;
  const picked = pickProject(args, flags, r);
  if (picked.error || picked.ambiguous) return picked;
  const { project } = picked;
  const memoryMd = readIfExists(project.memoryFile);
  const dynamicMd = readIfExists(project.dynamicFile);
  const payload = buildMemoryPayload(memoryMd, r.cfg.memoryInlineLimit);
  const n = flags.entries ? Number.parseInt(flags.entries, 10) : r.cfg.pullEntries;
  return {
    project,
    method: picked.method,
    warning: picked.warning,
    memory: payload.text,
    truncated: payload.truncated,
    entries: lastEntries(dynamicMd, n),
    stubs: parseEntries(dynamicMd).filter((e) => e.isStub),
    template: extractEntryTemplate(dynamicMd),
    filesPresent: fs.existsSync(project.memoryFile) && fs.existsSync(project.dynamicFile),
  };
}

function cmdStatus(args, flags) {
  const cfg = loadConfig();
  const out = {
    configured: Boolean(cfg && cfg.memoryRoot),
    config: cfg,
    memoryRootReachable: memoryRootReachable(cfg),
    detected: null,
    state: null,
    unsaved: [],
    hooksLog: tailLog(5),
  };
  if (out.memoryRootReachable) {
    const projects = loadProjects(cfg);
    const det = detectProject({ cwd: cwdOf(flags), projects, memoryRoot: cfg.memoryRoot });
    out.detected = det ? { project: det.project, method: det.method, warning: det.warning } : { project: null };
    out.projectCount = projects.length;
  }
  if (flags.session) {
    const st = loadState(String(flags.session));
    out.state = st;
    out.unsaved = st ? unsavedProjects(st) : [];
  }
  return out;
}

// ---------------------------------------------------------------- session state commands

function withState(flags, fn) {
  if (!flags.session) return { error: 'missing --session <id>' };
  const st = loadState(String(flags.session));
  if (!st) return { error: `no session state for ${flags.session}. The hooks create it at session start.` };
  const out = fn(st);
  saveState(st);
  return out;
}

function cmdPause(args, flags) {
  return withState(flags, (st) => { st.paused = true; return { paused: true }; });
}

function cmdResume(args, flags) {
  return withState(flags, (st) => { st.paused = false; return { paused: false }; });
}

function cmdMarkSaved(args, flags) {
  if (!flags.project) return { error: 'missing --project <folder>' };
  return withState(flags, (st) => {
    st.saved[String(flags.project)] = true;
    if (flags.heading) st.entryHeading[String(flags.project)] = String(flags.heading);
    return { saved: true, project: flags.project, heading: flags.heading || null };
  });
}

// ---------------------------------------------------------------- list / search

function cmdList() {
  const r = requireConfig();
  if (r.error) return r;
  const projects = r.projects.map((p) => {
    const present = fs.existsSync(p.memoryFile) && fs.existsSync(p.dynamicFile);
    const entries = present ? parseEntries(readIfExists(p.dynamicFile)) : [];
    return {
      name: p.name,
      folder: p.folder,
      repoPath: p.repoPath,
      type: p.type,
      status: p.status,
      summary: p.summary,
      filesPresent: present,
      lastEntryDate: entries.length ? entries[entries.length - 1].date : null,
      openStubs: entries.filter((e) => e.isStub).length,
    };
  });
  return { memoryRoot: r.cfg.memoryRoot, projects };
}

function walkMarkdown(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name === 'node_modules' || name.name.startsWith('.')) continue;
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walkMarkdown(full, out);
    else if (/\.md$/i.test(name.name)) out.push(full);
  }
  return out;
}

function cmdSearch(args) {
  const r = requireConfig();
  if (r.error) return r;
  const text = args.join(' ').trim();
  if (!text) return { error: 'missing search text: search <text>' };
  const needle = text.toLowerCase();
  const hits = [];
  for (const file of walkMarkdown(r.cfg.memoryRoot)) {
    const rel = path.relative(r.cfg.memoryRoot, file).replace(/\\/g, '/');
    const project = rel.includes('/') ? rel.split('/')[0] : '';
    const lines = readIfExists(file).split(/\r?\n/);
    let heading = '';
    for (let i = 0; i < lines.length; i++) {
      if (/^#{1,6}\s/.test(lines[i])) heading = lines[i].replace(/^#{1,6}\s+/, '').trim();
      if (lines[i].toLowerCase().includes(needle)) {
        hits.push({ project, file, line: i + 1, heading, text: lines[i].trim() });
        if (hits.length >= 200) return { query: text, hits, truncated: true };
      }
    }
  }
  return { query: text, hits, truncated: false };
}

// ---------------------------------------------------------------- init

function cmdInit(args, flags) {
  const r = requireConfig();
  if (r.error) return r;
  const name = String(flags.name || '').trim();
  const folder = String(flags.folder || name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')).trim();
  if (!name || !folder) return { error: 'usage: init --name "<Project Name>" --folder <Folder> [--cwd <dir>] [--path <recorded repo path>] [--type <type>] [--summary <text>]' };
  const cwd = cwdOf(flags);
  const recordedPath = flags.path ? String(flags.path) : cwd;
  const dir = path.join(r.cfg.memoryRoot, folder);
  if (fs.existsSync(dir)) return { error: `${dir} already exists; choose another --folder or use the existing project.` };
  if (r.projects.some((p) => p.folder.toLowerCase() === folder.toLowerCase())) return { error: `project folder ${folder} already exists in Projects.md.` };

  fs.mkdirSync(dir, { recursive: true });
  const memory = readRef('memory-template.md').replace(/<PROJECT>/g, name).replace(/<YYYY-MM-DD>/g, today());
  const dynamic = readRef('dynamic-template.md')
    .replace('# Dynamic Memory Log — <PROJECT>', `# Dynamic Memory Log — ${name}`)
    .replace(/<REPO_PATH>/g, recordedPath)
    .replace(/<PROJECT>/g, folder);
  fs.writeFileSync(path.join(dir, 'Memory.md'), memory, 'utf8');
  fs.writeFileSync(path.join(dir, 'DynamicMemory.md'), dynamic, 'utf8');

  const idxFile = path.join(r.cfg.memoryRoot, 'Projects.md');
  const idx = fs.existsSync(idxFile) ? fs.readFileSync(idxFile, 'utf8') : readRef('projects-template.md');
  fs.writeFileSync(idxFile, appendProjectRow(idx, {
    name, repoPath: recordedPath, type: flags.type ? String(flags.type) : '', folder,
    status: flags.status ? String(flags.status) : `Active — onboarded ${today()}`, summary: flags.summary ? String(flags.summary) : '',
  }), 'utf8');

  let markerWritten = false;
  if (!isInside(cwd, recordedPath)) {
    fs.writeFileSync(path.join(cwd, '.aimemory'), folder + '\n', 'utf8');
    markerWritten = true;
    const gitDir = path.join(cwd, '.git');
    if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
      const infoDir = path.join(gitDir, 'info');
      fs.mkdirSync(infoDir, { recursive: true });
      const exclude = path.join(infoDir, 'exclude');
      const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
      if (!/^\.aimemory$/m.test(current)) fs.appendFileSync(exclude, (current && !current.endsWith('\n') ? '\n' : '') + '.aimemory\n', 'utf8');
    }
  }
  return {
    name, folder, repoPath: recordedPath, memoryFile: path.join(dir, 'Memory.md'), dynamicFile: path.join(dir, 'DynamicMemory.md'),
    projectsIndex: idxFile, markerWritten,
  };
}

// ---------------------------------------------------------------- append-entry

function cmdAppendEntry(args, flags) {
  const r = requireConfig();
  if (r.error) return r;
  const folder = String(flags.project || '');
  const project = r.projects.find((p) => p.folder.toLowerCase() === folder.toLowerCase());
  if (!project) return { error: `unknown project folder ${folder || '(none)'}; pass --project <folder>` };
  if (!flags.file || !fs.existsSync(String(flags.file))) return { error: 'missing or unreadable --file <path to entry text>' };
  const text = fs.readFileSync(String(flags.file), 'utf8').replace(/\r\n/g, '\n').trim();
  if (!text) return { error: 'entry file is empty' };
  const st = flags.session ? loadState(String(flags.session)) : null;
  const lines = text.split('\n');
  let result;

  if (flags.extend) {
    const prev = st && st.entryHeading && st.entryHeading[project.folder];
    if (!prev) return { error: 'nothing to extend: this session has not written an entry for ' + project.folder + ' yet; append a full entry instead.' };
    if (appendToLastEntry(project.dynamicFile, prev, lines)) {
      result = { appended: true, extended: true, heading: prev };
    } else {
      const level = dominantLevel(readIfExists(project.dynamicFile));
      const heading = `${prev} (continued)`;
      appendEntry(project.dynamicFile, [`${'#'.repeat(level)} ${today()} — ${heading}`, ...lines].join('\n'));
      result = { appended: true, extended: false, heading, error: `the session's entry "${prev}" is no longer the last entry in the file; appended a new continuation entry instead.` };
    }
  } else {
    const m = ENTRY_HEADING_RE.exec(lines[0]);
    if (!m) return { error: 'the entry must start with a dated heading like "### YYYY-MM-DD — <title> [<agent>]"' };
    appendEntry(project.dynamicFile, text);
    result = { appended: true, extended: false, heading: m[3].trim() };
  }

  if (st) {
    st.saved[project.folder] = true;
    st.entryHeading[project.folder] = result.heading;
    saveState(st);
    result.stateUpdated = true;
  } else {
    result.stateUpdated = false;
  }
  result.file = project.dynamicFile;
  return result;
}

// ---------------------------------------------------------------- output

function toText(obj, indent = '') {
  if (obj === null || obj === undefined) return indent + '(none)';
  if (Array.isArray(obj)) {
    if (!obj.length) return indent + '(empty)';
    return obj.map((item) => (typeof item === 'object' ? toText(item, indent + '  ').replace(/^ {2}/, indent + '- ') : `${indent}- ${item}`)).join('\n');
  }
  if (typeof obj === 'object') {
    return Object.entries(obj).map(([k, v]) => (
      typeof v === 'object' && v !== null ? `${indent}${k}:\n${toText(v, indent + '  ')}` : `${indent}${k}: ${v}`
    )).join('\n');
  }
  return indent + String(obj);
}

function listText(out) {
  if (out.error) return `error: ${out.error}`;
  const rows = out.projects.map((p) => `${p.name}  [${p.folder}]  ${p.status || ''}\n    path: ${p.repoPath}\n    last entry: ${p.lastEntryDate || '—'}  open stubs: ${p.openStubs}${p.filesPresent ? '' : '  (memory files missing)'}`);
  return `Memory root: ${out.memoryRoot}\n\n${rows.join('\n')}`;
}

const COMMANDS = {
  config: cmdConfig,
  detect: cmdDetect,
  context: cmdContext,
  status: cmdStatus,
  pause: cmdPause,
  resume: cmdResume,
  'mark-saved': cmdMarkSaved,
  list: cmdList,
  search: cmdSearch,
  init: cmdInit,
  'append-entry': cmdAppendEntry,
};

function run(cmdName, args, flags) {
  const fn = COMMANDS[cmdName];
  if (!fn) {
    process.stdout.write(JSON.stringify({ error: `unknown command: ${cmdName}. Known: ${Object.keys(COMMANDS).join(', ')}` }));
    process.exitCode = 1;
    return;
  }
  let out;
  try {
    out = fn(args, flags) || {};
  } catch (err) {
    out = { error: err && err.message ? err.message : String(err) };
  }
  if (flags.text) {
    process.stdout.write((cmdName === 'list' ? listText(out) : toText(out)) + '\n');
  } else {
    process.stdout.write(JSON.stringify(out, null, 2));
  }
  process.exitCode = out && out.error && !out.appended ? 1 : 0;
}

module.exports = { run, COMMANDS };
