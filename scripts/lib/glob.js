'use strict';
const { normalizePath } = require('./paths');

const cache = new Map();

/** Convert a glob (`**`, `*`, `?`) into an anchored, case-insensitive RegExp over normalised paths. */
function globToRegExp(pattern) {
  const norm = normalizePath(pattern);
  if (cache.has(norm)) return cache.get(norm);
  let re = '^';
  for (let i = 0; i < norm.length; i++) {
    const ch = norm[i];
    if (ch === '*') {
      if (norm[i + 1] === '*') {
        // `**/` matches zero or more directories; a trailing `**` matches the rest.
        const slashAfter = norm[i + 2] === '/';
        re += slashAfter ? '(?:.*/)?' : '.*';
        i += slashAfter ? 2 : 1;
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else {
      re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  re += '$';
  const compiled = new RegExp(re, 'i');
  cache.set(norm, compiled);
  return compiled;
}

function matchGlob(pattern, filePath) {
  return globToRegExp(pattern).test(normalizePath(filePath));
}

module.exports = { matchGlob, globToRegExp };
