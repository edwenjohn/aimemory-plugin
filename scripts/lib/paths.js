'use strict';
const os = require('node:os');
const path = require('node:path');

/** Home directory, overridable with AIMEMORY_HOME (used by tests). */
function homeDir() {
  return process.env.AIMEMORY_HOME || os.homedir();
}

/** `<home>/.aimemory` */
function aimemoryDir() {
  return path.join(homeDir(), '.aimemory');
}

/**
 * Canonical form for comparing paths across tools and operating systems:
 * trims whitespace and surrounding backticks, forward slashes, lower-case,
 * collapses `.` segments and duplicate slashes, no trailing slash.
 */
function normalizePath(p) {
  if (typeof p !== 'string') return '';
  let s = p.trim().replace(/^`+|`+$/g, '').trim();
  if (!s) return '';
  s = s.replace(/\\/g, '/');
  const parts = s.split('/');
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (seg === '.' ) continue;
    if (seg === '' && i > 0) continue; // duplicate or trailing slash
    if (seg === '..' && out.length && out[out.length - 1] !== '..' && out[out.length - 1] !== '') { out.pop(); continue; }
    out.push(seg);
  }
  let joined = out.join('/');
  if (joined.length > 1) joined = joined.replace(/\/+$/, '');
  return joined.toLowerCase();
}

/** True when `child` equals `parent` or lies beneath it (segment-safe). */
function isInside(child, parent) {
  const c = normalizePath(child);
  const p = normalizePath(parent);
  if (!c || !p) return false;
  if (c === p) return true;
  return c.startsWith(p.endsWith('/') ? p : p + '/');
}

module.exports = { homeDir, aimemoryDir, normalizePath, isInside };
