'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { normalizePath, isInside } = require('./paths');

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/;

function splitRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((c) => c.trim());
}

function isSeparatorRow(cells) {
  return cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function stripBackticks(s) {
  return String(s || '').trim().replace(/^`+|`+$/g, '').trim();
}

function folderFromLink(cell) {
  const m = LINK_RE.exec(cell || '');
  if (!m) return null;
  const target = m[1].replace(/\\/g, '/');
  const idx = target.indexOf('/');
  return idx > 0 ? target.slice(0, idx) : null;
}

/**
 * Parse the first Markdown table whose header contains "Project" and "Path".
 * Columns are mapped by header text, so order is free.
 */
function parseProjectsIndex(markdown, memoryRoot) {
  const lines = String(markdown || '').split(/\r?\n/);
  const projects = [];
  let header = null;
  for (let i = 0; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (!cells) { if (header && projects.length) break; header = null; continue; }
    if (!header) {
      const lower = cells.map((c) => c.toLowerCase());
      if (lower.some((c) => c.startsWith('project')) && lower.some((c) => c.startsWith('path'))) {
        header = lower.map((c) => c.replace(/\s*\(.*$/, '').trim());
      }
      continue;
    }
    if (isSeparatorRow(cells)) continue;
    const get = (name) => { const k = header.indexOf(name); return k >= 0 ? (cells[k] || '') : ''; };
    const name = get('project');
    const folder = folderFromLink(get('memory')) || folderFromLink(get('dynamic log'));
    if (!name || !folder) continue;
    projects.push({
      name,
      repoPath: stripBackticks(get('path')),
      type: get('type'),
      folder,
      memoryFile: path.join(memoryRoot, folder, 'Memory.md'),
      dynamicFile: path.join(memoryRoot, folder, 'DynamicMemory.md'),
      status: get('status'),
      summary: get('one-line summary') || get('summary'),
    });
  }
  return projects;
}

/** Walk up from cwd looking for a `.aimemory` marker file naming a project folder. */
function findMarker(cwd) {
  let dir = path.resolve(cwd);
  for (;;) {
    const candidate = path.join(dir, '.aimemory');
    if (fs.existsSync(candidate)) {
      const folder = fs.readFileSync(candidate, 'utf8').split(/\r?\n/)[0].trim();
      if (folder) return { folder, markerPath: candidate };
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function longestPathMatch(target, projects) {
  let best = null;
  let bestLen = -1;
  for (const p of projects) {
    if (!p.repoPath) continue;
    if (isInside(target, p.repoPath)) {
      const len = normalizePath(p.repoPath).length;
      if (len > bestLen) { best = p; bestLen = len; }
    }
  }
  return best;
}

/** Spec §6.2 precedence: Projects.md path match, then .aimemory marker, then folder name. */
function detectProject({ cwd, projects, memoryRoot }) {
  const byPath = longestPathMatch(cwd, projects);
  if (byPath) return { project: byPath, method: 'path' };

  const marker = findMarker(cwd);
  if (marker) {
    const p = projects.find((x) => x.folder.toLowerCase() === marker.folder.toLowerCase());
    if (p) {
      const result = { project: p, method: 'marker' };
      if (p.repoPath && fs.existsSync(p.repoPath) && !isInside(cwd, p.repoPath)) {
        result.warning = `.aimemory marker names ${p.folder}, whose indexed path (${p.repoPath}) is a different existing directory. Check Projects.md if this is wrong.`;
      }
      return result;
    }
  }

  const base = path.basename(path.resolve(cwd)).toLowerCase();
  const byFolder = projects.find((x) => x.folder.toLowerCase() === base);
  if (byFolder) return { project: byFolder, method: 'folder' };
  void memoryRoot;
  return null;
}

function projectForFile(filePath, projects) {
  return longestPathMatch(filePath, projects);
}

/** Resolve a user-typed project name: exact on name/folder, else prefix on either. */
function resolveProjectArg(arg, projects) {
  const q = String(arg || '').trim().toLowerCase();
  if (!q) return null;
  const norm = (s) => s.toLowerCase().replace(/[\s_]+/g, '-');
  const exact = projects.filter((p) => p.name.toLowerCase() === q || p.folder.toLowerCase() === q || norm(p.name) === norm(q));
  if (exact.length === 1) return { project: exact[0] };
  if (exact.length > 1) return { ambiguous: exact };
  const prefix = projects.filter((p) => p.name.toLowerCase().startsWith(q) || p.folder.toLowerCase().startsWith(q) || norm(p.name).startsWith(norm(q)));
  if (prefix.length === 1) return { project: prefix[0] };
  if (prefix.length > 1) return { ambiguous: prefix };
  return null;
}

const DEFAULT_HEADER = ['project', 'path', 'type', 'memory', 'dynamic log', 'status', 'one-line summary'];

function cellFor(column, row) {
  switch (column) {
    case 'project': return row.name || '';
    case 'path': return row.repoPath ? '`' + row.repoPath + '`' : '';
    case 'type': return row.type || '';
    case 'memory': return `[Memory.md](${row.folder}/Memory.md)`;
    case 'dynamic log': return `[DynamicMemory.md](${row.folder}/DynamicMemory.md)`;
    case 'status': return row.status || '';
    case 'one-line summary':
    case 'summary': return row.summary || '';
    default: return '';
  }
}

/** Header column names (normalised) of the projects table in `lines`, or the default layout. */
function tableHeader(lines) {
  for (const line of lines) {
    const cells = splitRow(line);
    if (!cells) continue;
    const lower = cells.map((c) => c.toLowerCase());
    if (lower.some((c) => c.startsWith('project')) && lower.some((c) => c.startsWith('path'))) {
      return lower.map((c) => c.replace(/\s*\(.*$/, '').trim());
    }
  }
  return DEFAULT_HEADER;
}

function renderRow(row, header) {
  return '| ' + header.map((col) => cellFor(col, row)).join(' | ') + ' |';
}

/** Insert a project row before the "*(Add new rows" marker, else after the last table row. */
function appendProjectRow(markdown, row) {
  const eol = /\r\n/.test(markdown) ? '\r\n' : '\n';
  const lines = markdown.split(/\r?\n/);
  const rendered = renderRow(row, tableHeader(lines));
  const markerIdx = lines.findIndex((l) => l.trim().startsWith('*(Add new rows'));
  if (markerIdx > 0) {
    let insertAt = markerIdx;
    while (insertAt > 0 && lines[insertAt - 1].trim() === '') insertAt--;
    lines.splice(insertAt, 0, rendered);
    return lines.join(eol);
  }
  let lastRow = -1;
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (cells) { inTable = true; lastRow = i; } else if (inTable && lastRow >= 0) break;
  }
  if (lastRow >= 0) lines.splice(lastRow + 1, 0, rendered);
  else lines.push(rendered);
  return lines.join(eol);
}

module.exports = {
  parseProjectsIndex, findMarker, detectProject, projectForFile, resolveProjectArg, appendProjectRow,
};
