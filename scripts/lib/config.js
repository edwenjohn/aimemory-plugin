'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { aimemoryDir } = require('./paths');

const DEFAULTS = Object.freeze({
  memoryRoot: null,
  autoSave: 'block', // "block" | "remind" | "off"
  pullEntries: 8,
  memoryInlineLimit: 40000,
  ignore: [
    '**/*.min.css', '**/*.min.js', '**/*.map', '**/*.zip', '**/package-lock.json',
    '**/node_modules/**', '**/dist/**', '**/build/**', '**/.claude/**', '**/.codex/**',
  ],
});

function configPath() {
  return path.join(aimemoryDir(), 'config.json');
}

/** Stored config merged over DEFAULTS, or null when no config file exists. */
function loadConfig() {
  const file = configPath();
  if (!fs.existsSync(file)) return null;
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { ...DEFAULTS, ...stored, ignore: Array.isArray(stored.ignore) ? stored.ignore : [...DEFAULTS.ignore] };
}

/** Merge `partial` into the stored config (or DEFAULTS), write it, return the result. */
function saveConfig(partial) {
  const current = loadConfig() || { ...DEFAULTS, ignore: [...DEFAULTS.ignore] };
  const next = { ...current, ...partial };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

function memoryRootReachable(cfg) {
  return Boolean(cfg && typeof cfg.memoryRoot === 'string' && cfg.memoryRoot && fs.existsSync(cfg.memoryRoot));
}

module.exports = { DEFAULTS, configPath, loadConfig, saveConfig, memoryRootReachable };
