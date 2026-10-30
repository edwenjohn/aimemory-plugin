'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { aimemoryDir } = require('./paths');

function logPath() {
  return path.join(aimemoryDir(), 'hooks.log');
}

/** Append a timestamped line to ~/.aimemory/hooks.log. Never throws. */
function logError(err, context = '') {
  try {
    fs.mkdirSync(aimemoryDir(), { recursive: true });
    const msg = err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : String(err);
    fs.appendFileSync(logPath(), `${new Date().toISOString()} ${context ? context + ': ' : ''}${msg}\n`, 'utf8');
  } catch { /* logging must never break a hook */ }
}

function logInfo(line) {
  try {
    fs.mkdirSync(aimemoryDir(), { recursive: true });
    fs.appendFileSync(logPath(), `${new Date().toISOString()} ${line}\n`, 'utf8');
  } catch { /* ignore */ }
}

function tailLog(n = 5) {
  try {
    return fs.readFileSync(logPath(), 'utf8').trim().split(/\r?\n/).slice(-n);
  } catch {
    return [];
  }
}

module.exports = { logPath, logError, logInfo, tailLog };
