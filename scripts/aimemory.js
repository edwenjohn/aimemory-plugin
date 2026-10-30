#!/usr/bin/env node
'use strict';
/**
 * aimemory CLI: hook entry points for Claude Code and Codex, plus the
 * subcommands the skills call. Hook commands never exit non-zero and
 * always print JSON.
 *
 *   node aimemory.js hook-session-start|hook-post-tool-use|hook-stop|hook-session-end --tool claude|codex
 *   node aimemory.js <command> [args] [--tool claude|codex] [--text]
 */
const fs = require('node:fs');
const { logError } = require('./lib/log');

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; } else flags[key] = true;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

const HOOKS = {
  'hook-session-start': 'sessionStart',
  'hook-post-tool-use': 'postToolUse',
  'hook-stop': 'stop',
  'hook-session-end': 'sessionEnd',
};

function runHook(cmdName, flags) {
  let result = {};
  try {
    const raw = readStdin();
    const input = raw.trim() ? JSON.parse(raw) : null;
    if (!input || typeof input !== 'object') throw new Error(`hook ${cmdName}: empty or invalid JSON on stdin`);
    const hooks = require('./lib/hooks');
    result = hooks[HOOKS[cmdName]](input, { tool: flags.tool === 'codex' ? 'codex' : 'claude' }) || {};
  } catch (err) {
    logError(err, cmdName);
    result = {};
  }
  process.stdout.write(JSON.stringify(result));
  process.exitCode = 0;
}

function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const cmdName = positional[0];
  if (!cmdName) {
    process.stdout.write(JSON.stringify({ error: 'usage: aimemory <command> [args] [--tool claude|codex]' }));
    process.exitCode = 1;
    return;
  }
  if (HOOKS[cmdName]) return runHook(cmdName, flags);
  let commands;
  try {
    commands = require('./lib/commands');
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: `unknown command: ${cmdName}` }));
    process.exitCode = 1;
    return;
  }
  return commands.run(cmdName, positional.slice(1), flags);
}

main();
