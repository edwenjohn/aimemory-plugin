#!/usr/bin/env node
'use strict';
/**
 * Generate codex-skills/ from skills/.
 *
 * Claude Code names a plugin skill `/aimemory:<dir>` and a frontmatter `name`
 * would replace the directory segment, so the Claude source carries no name.
 * Codex requires `name` and shows `$<name>`. This script writes the Codex copy:
 *   - adds `name: aimemory-<dir>` to the frontmatter
 *   - rewrites `/aimemory:<skill>` to `$aimemory-<skill>`
 *   - rewrites `${CLAUDE_PLUGIN_ROOT}` to `${PLUGIN_ROOT}`
 *   - rewrites the `[Claude Code]` agent tag to `[Codex]`
 *   - copies skills/_references verbatim
 * The output is committed; tests fail when it is stale.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'skills');
const OUT = path.join(ROOT, 'codex-skills');

function transformSkill(dir, markdown) {
  let md = markdown.replace(/\r\n/g, '\n');
  md = md.replace(/^---\n/, `---\nname: aimemory-${dir}\n`);
  md = md.replace(/\/aimemory:([a-z][a-z0-9-]*)/g, '$$aimemory-$1');
  md = md.split('${CLAUDE_PLUGIN_ROOT}').join('${PLUGIN_ROOT}');
  md = md.split('[Claude Code]').join('[Codex]');
  return md;
}

function skillDirs() {
  return fs.readdirSync(SRC, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && fs.existsSync(path.join(SRC, d.name, 'SKILL.md')))
    .map((d) => d.name)
    .sort();
}

/** Map of output path (relative to OUT) → content. */
function render() {
  const files = new Map();
  for (const dir of skillDirs()) {
    files.set(path.join(dir, 'SKILL.md'), transformSkill(dir, fs.readFileSync(path.join(SRC, dir, 'SKILL.md'), 'utf8')));
  }
  const refs = path.join(SRC, '_references');
  if (fs.existsSync(refs)) {
    for (const name of fs.readdirSync(refs)) {
      files.set(path.join('_references', name), fs.readFileSync(path.join(refs, name), 'utf8'));
    }
  }
  return files;
}

function build() {
  const files = render();
  const written = [];
  for (const [rel, content] of files) {
    const target = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
    written.push(target);
  }
  // Remove generated skills whose source is gone.
  if (fs.existsSync(OUT)) {
    for (const d of fs.readdirSync(OUT, { withFileTypes: true })) {
      if (d.isDirectory() && d.name !== '_references' && !files.has(path.join(d.name, 'SKILL.md'))) {
        fs.rmSync(path.join(OUT, d.name), { recursive: true, force: true });
      }
    }
  }
  return written.sort();
}

function isStale() {
  for (const [rel, content] of render()) {
    const target = path.join(OUT, rel);
    if (!fs.existsSync(target)) return true;
    if (fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== content.replace(/\r\n/g, '\n')) return true;
  }
  return false;
}

if (require.main === module) {
  const written = build();
  process.stdout.write(`codex-skills: wrote ${written.length} files\n`);
}

module.exports = { build, isStale, transformSkill, render };
