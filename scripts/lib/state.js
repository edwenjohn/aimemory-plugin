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

function saveState(state) {
  fs.mkdirSync(sessionsDir(), { recursive: true });
  fs.writeFileSync(statePath(state.sessionId), JSON.stringify(state, null, 2) + '\n', 'utf8');
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
  UNREGISTERED, sessionsDir, statePath, newState, loadState, saveState, deleteState,
  recordChange, unsavedProjects, sweep,
};
