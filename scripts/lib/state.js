'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { aimemoryDir, normalizePath, isInside } = require('./paths');
const { matchGlob } = require('./glob');
const { projectForFile } = require('./projects');

const UNREGISTERED = '_unregistered';

function sessionsDir() {
  return path.join(aimemoryDir(), 'sessions');
}

function statePath(sessionId) {
  const safe = String(sessionId || 'unknown').replace(/[^A-Za-z0-9_.-]/g, '-');
  return path.join(sessionsDir(), `${safe}.json`);
}

function newState({ sessionId, tool, cwd, project }) {
  return {
    sessionId,
    tool,
    cwd,
    startedAt: new Date().toISOString(),
    project: project || null,
    changes: {},
    saved: {},
    entryHeading: {},
    blockedOnce: false,
    paused: false,
    warnedUnregistered: false,
    warnedUnreachable: false,
  };
}

function loadState(sessionId) {
  const file = statePath(sessionId);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Write atomically (temp file + rename) so a concurrent reader never sees a half-written file. */
function saveState(state) {
  fs.mkdirSync(sessionsDir(), { recursive: true });
  const target = statePath(state.sessionId);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
  try {
    fs.renameSync(tmp, target);
  } catch {
    // Windows can refuse to rename over a file another process has open; fall back to a plain write.
    fs.writeFileSync(target, JSON.stringify(state, null, 2) + '\n', 'utf8');
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const LOCK_STALE_MS = 5000;
const LOCK_WAIT_MS = 3000;

/** Run fn while holding an exclusive lock file. Stale locks (> 5 s) are broken; after 3 s we proceed unlocked. */
function withLock(lockPath, fn) {
  const start = Date.now();
  for (;;) {
    let fd = null;
    try {
      fd = fs.openSync(lockPath, 'wx');
    } catch (err) {
      // EEXIST: someone holds the lock. EPERM/EACCES/EBUSY: Windows while another process is unlinking it.
      if (!['EEXIST', 'EPERM', 'EACCES', 'EBUSY'].includes(err.code)) throw err;
      try {
        if (Date.now() - fs.statSync(lockPath).mtimeMs > LOCK_STALE_MS) { fs.unlinkSync(lockPath); continue; }
      } catch { /* lock vanished; retry */ }
      if (Date.now() - start > LOCK_WAIT_MS) return fn();
      sleepMs(5 + Math.floor(Math.random() * 10));
      continue;
    }
    try {
      return fn();
    } finally {
      try { fs.closeSync(fd); } catch { /* ignore */ }
      try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
    }
  }
}

/**
 * Load → mutate → save under a per-session lock, so hooks and CLI commands running
 * in parallel never overwrite each other's changes. `init` (optional) creates the
 * state when none exists. Returns the saved state, or null when there is none.
 */
function updateState(sessionId, mutate, init) {
  fs.mkdirSync(sessionsDir(), { recursive: true });
  return withLock(statePath(sessionId) + '.lock', () => {
    let state = loadState(sessionId);
    if (!state && init) state = init();
    if (!state) return null;
    mutate(state);
    saveState(state);
    return state;
  });
}

function deleteState(sessionId) {
  try { fs.unlinkSync(statePath(sessionId)); } catch { /* already gone */ }
}

/**
 * Record a touched file. Returns 'recorded', 'ignored', or 'memory-write'.
 * Writes under memoryRoot are never changes; a write to a project's
 * DynamicMemory.md marks that project saved.
 */
function recordChange(state, filePath, projects, ignore, memoryRoot) {
  const norm = normalizePath(filePath);
  if (!norm) return 'ignored';
  if (memoryRoot && isInside(norm, memoryRoot)) {
    const dyn = projects.find((p) => normalizePath(p.dynamicFile) === norm);
    if (dyn) {
      state.saved[dyn.folder] = true;
      return 'memory-write';
    }
    return 'ignored';
  }
  if ((ignore || []).some((g) => matchGlob(g, norm))) return 'ignored';
  const project = projectForFile(norm, projects);
  const key = project ? project.folder : UNREGISTERED;
  const list = state.changes[key] || (state.changes[key] = []);
  if (!list.includes(norm)) list.push(norm);
  if (project) state.saved[project.folder] = false;
  return 'recorded';
}

/** Registered projects with changes that have not been saved. */
function unsavedProjects(state) {
  return Object.entries(state.changes)
    .filter(([folder, files]) => folder !== UNREGISTERED && files.length && !state.saved[folder])
    .map(([folder, files]) => ({ folder, files: [...files] }));
}

/** Delete state files older than maxAgeDays. Returns the number removed. */
function sweep(maxAgeDays = 7) {
  const dir = sessionsDir();
  if (!fs.existsSync(dir)) return 0;
  const cutoff = Date.now() - maxAgeDays * 86400000;
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    try {
      if (fs.statSync(file).mtimeMs < cutoff) { fs.unlinkSync(file); removed++; }
    } catch { /* ignore races */ }
  }
  return removed;
}

module.exports = {
  UNREGISTERED, sessionsDir, statePath, newState, loadState, saveState, deleteState, updateState, withLock,
  recordChange, unsavedProjects, sweep,
};
