'use strict';
const fs = require('node:fs');

const ENTRY_RE = /^(#{2,3}) (\d{4}-\d{2}-\d{2})\s*(?:[—–-]+\s*)?(.*)$/;
const FENCE_RE = /^\s*(```|~~~)/;
const CRITICAL_RE = /⚠|non-negotiable|read before|security|safety/i;
const TOOL_LABEL = { claude: 'Claude Code', codex: 'Codex' };

function splitLines(md) {
  return String(md || '').split(/\r?\n/);
}

function detectEol(md) {
  return /\r\n/.test(String(md || '')) ? '\r\n' : '\n';
}

/**
 * Entries are dated h2/h3 headings outside fenced code blocks.
 * `start` is the 0-based heading line; `end` is the exclusive end line.
 */
function parseEntries(md) {
  const lines = splitLines(md);
  const entries = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = ENTRY_RE.exec(line);
    if (!m) continue;
    if (entries.length) entries[entries.length - 1].end = i;
    entries.push({
      level: m[1].length,
      date: m[2],
      heading: m[3].trim(),
      start: i,
      end: lines.length,
      text: '',
      isStub: /\[auto-stub\]/.test(m[3]),
    });
  }
  for (const e of entries) {
    let end = e.end;
    while (end > e.start + 1 && lines[end - 1].trim() === '') end--;
    e.text = lines.slice(e.start, end).join('\n');
  }
  return entries;
}

function lastEntries(md, n) {
  const all = parseEntries(md);
  return n >= all.length ? all : all.slice(all.length - n);
}

/** The fenced block that follows a heading containing "Entry template", without the fences. */
function extractEntryTemplate(md) {
  const lines = splitLines(md);
  const idx = lines.findIndex((l) => /^#{1,6}\s.*entry template/i.test(l));
  if (idx < 0) return null;
  let i = idx + 1;
  while (i < lines.length && !FENCE_RE.test(lines[i])) {
    if (/^#{1,6}\s/.test(lines[i])) return null;
    i++;
  }
  if (i >= lines.length) return null;
  const body = [];
  for (i += 1; i < lines.length && !FENCE_RE.test(lines[i]); i++) body.push(lines[i]);
  return body.join('\n').trim() || null;
}

/** 3 when the file logs under a `## Log` heading or has more h3 than h2 entries, else 2. */
function dominantLevel(md) {
  const lines = splitLines(md);
  if (lines.some((l) => /^## Log\b/.test(l))) return 3;
  const es = parseEntries(md);
  const h3 = es.filter((e) => e.level === 3).length;
  const h2 = es.length - h3;
  return h3 > h2 ? 3 : 2;
}

function toEol(text, eol) {
  return String(text).replace(/\r?\n/g, eol);
}

/** Append an entry at the end of the file with exactly one blank line before it. */
function appendEntry(filePath, entryText) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const eol = detectEol(existing);
  const body = existing.replace(/(\r?\n)+$/, '');
  const entry = toEol(String(entryText).trim(), eol);
  const out = body ? body + eol + eol + entry + eol : entry + eol;
  fs.writeFileSync(filePath, out, 'utf8');
}

/** Append `lines` to the end of the file only if the last entry's heading equals `heading`. */
function appendToLastEntry(filePath, heading, lines) {
  if (!fs.existsSync(filePath)) return false;
  const existing = fs.readFileSync(filePath, 'utf8');
  const entries = parseEntries(existing);
  if (!entries.length) return false;
  const last = entries[entries.length - 1];
  if (last.heading.trim() !== String(heading).trim()) return false;
  const eol = detectEol(existing);
  const body = existing.replace(/(\r?\n)+$/, '');
  const extra = lines.map((l) => toEol(String(l).trimEnd(), eol)).join(eol);
  fs.writeFileSync(filePath, body + eol + extra + eol, 'utf8');
  return true;
}

function sections(md) {
  const lines = splitLines(md);
  const out = [];
  let inFence = false;
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) inFence = !inFence;
    if (!inFence && /^## /.test(line)) {
      if (current) current.end = i;
      current = { heading: line.replace(/^## /, '').trim(), start: i, end: lines.length };
      out.push(current);
    }
  }
  return out.map((s) => ({ ...s, text: lines.slice(s.start, s.end).join('\n').trimEnd() }));
}

/**
 * Whole Memory.md when it fits; otherwise the TL;DR (or first) section, the
 * list of all `##` headings, and every section whose heading looks critical.
 */
function buildMemoryPayload(md, limit) {
  const text = String(md || '');
  if (text.length <= limit) return { text, truncated: false };
  const secs = sections(text);
  const lead = secs.find((s) => /tl;dr/i.test(s.heading)) || secs[0];
  const critical = secs.filter((s) => s !== lead && CRITICAL_RE.test(s.heading));
  const parts = [];
  parts.push(`> Memory.md is ${text.length.toLocaleString()} characters, above the inline limit of ${limit.toLocaleString()}. Below: the TL;DR, the section list, and the critical sections. Run the pull skill (/aimemory:pull) for the full file.`);
  if (lead) parts.push(lead.text);
  parts.push('### Sections in Memory.md\n' + secs.map((s) => `- ${s.heading}`).join('\n'));
  for (const s of critical) parts.push(s.text);
  return { text: parts.join('\n\n'), truncated: true };
}

/** Spec §6.6 stub written when a session ends with unlogged changes. */
function renderStub({ date, level, files, tool, sessionId }) {
  const hashes = '#'.repeat(level === 3 ? 3 : 2);
  const label = TOOL_LABEL[tool] || tool || 'unknown tool';
  const fileList = files && files.length ? files.join(', ') : '(file list unavailable)';
  const sid = String(sessionId || '').slice(0, 8) || 'unknown';
  return [
    `${hashes} ${date} — [auto-stub] session ended with unlogged changes`,
    `- Files: ${fileList} (${label}, session ${sid})`,
    '- Expand or correct this entry at the start of the next session.',
  ].join('\n');
}

module.exports = {
  parseEntries, lastEntries, extractEntryTemplate, dominantLevel, detectEol,
  appendEntry, appendToLastEntry, buildMemoryPayload, renderStub, sections,
};
