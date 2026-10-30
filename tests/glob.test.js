'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { matchGlob } = require('../scripts/lib/glob');

test('**/*.min.css matches at any depth, not other extensions', () => {
  assert.equal(matchGlob('**/*.min.css', 'c:/site/assets/css/shop.min.css'), true);
  assert.equal(matchGlob('**/*.min.css', 'c:/shop.min.css'), true);
  assert.equal(matchGlob('**/*.min.css', 'c:/site/assets/css/shop.css'), false);
});

test('**/.claude/** matches anything under a .claude directory', () => {
  assert.equal(matchGlob('**/.claude/**', 'c:/repo/.claude/settings.local.json'), true);
  assert.equal(matchGlob('**/.claude/**', 'c:/repo/.claude/a/b.json'), true);
  assert.equal(matchGlob('**/.claude/**', 'c:/repo/claude/settings.json'), false);
});

test('* stays within a segment, ? matches one char, patterns are case-insensitive and slash-normalised', () => {
  assert.equal(matchGlob('**/dist/**', 'c:/repo/dist/x/y.js'), true);
  assert.equal(matchGlob('c:/repo/*.js', 'c:/repo/a.js'), true);
  assert.equal(matchGlob('c:/repo/*.js', 'c:/repo/sub/a.js'), false);
  assert.equal(matchGlob('**/file?.txt', 'd:/x/file1.txt'), true);
  assert.equal(matchGlob('**/file?.txt', 'd:/x/file12.txt'), false);
  assert.equal(matchGlob('**\\*.ZIP', 'C:\\Downloads\\a.zip'), true);
});
