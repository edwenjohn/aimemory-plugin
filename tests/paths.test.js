'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { normalizePath, isInside, homeDir, aimemoryDir } = require('../scripts/lib/paths');

test('normalizePath strips backticks, lowercases, forward-slashes, drops trailing slash', () => {
  assert.equal(normalizePath('`c:\\wamp64\\www\\Site\\` '), 'c:/wamp64/www/site');
  assert.equal(normalizePath('C:/Users/AU/Documents/'), 'c:/users/au/documents');
  assert.equal(normalizePath('/f/x/./y'), '/f/x/y');
});

test('normalizePath handles empty and non-string input', () => {
  assert.equal(normalizePath(''), '');
  assert.equal(normalizePath(undefined), '');
});

test('isInside is segment-safe and case-insensitive', () => {
  assert.equal(isInside('C:/a/b/c', 'c:\\a\\b'), true);
  assert.equal(isInside('C:/a/b', 'C:/a/b'), true);
  assert.equal(isInside('C:/a/bc', 'C:/a/b'), false);
  assert.equal(isInside('D:/a/b/c', 'C:/a/b'), false);
});

test('homeDir honours AIMEMORY_HOME override, aimemoryDir is <home>/.aimemory', () => {
  const prev = process.env.AIMEMORY_HOME;
  process.env.AIMEMORY_HOME = path.join(os.tmpdir(), 'aimemory-home-test');
  try {
    assert.equal(homeDir(), path.join(os.tmpdir(), 'aimemory-home-test'));
    assert.equal(aimemoryDir(), path.join(os.tmpdir(), 'aimemory-home-test', '.aimemory'));
  } finally {
    if (prev === undefined) delete process.env.AIMEMORY_HOME; else process.env.AIMEMORY_HOME = prev;
  }
  assert.equal(homeDir(), process.env.AIMEMORY_HOME || os.homedir());
});
