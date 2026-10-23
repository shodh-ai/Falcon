'use strict';

const path = require('node:path');
const picomatch = require('picomatch');
const { globSync: tinyGlobSync } = require('tinyglobby');

/**
 * Implements only the directory-glob call made by Next's getRootDirs helper.
 * This is deliberately not a replacement for the complete fast-glob API.
 */
function globSync(pattern, options) {
  if (
    typeof pattern !== 'string' ||
    pattern.length === 0 ||
    !options ||
    options.onlyDirectories !== true ||
    Object.keys(options).some((key) => key !== 'onlyDirectories')
  ) {
    throw new TypeError(
      'The Falcon Next ESLint adapter supports only globSync(string, { onlyDirectories: true }). Review the pinned Next plugin before changing its usage.',
    );
  }

  const trailingSlash = pattern.endsWith('/');
  const matchPattern = trailingSlash ? pattern.slice(0, -1) || '/' : pattern;
  const matcher = picomatch.makeRe(matchPattern, { posix: true });
  // fast-glob does not include a globstar's base directory itself.
  const globstarBase = matchPattern.match(/^(.*?)(?:\/\*\*)+$/);
  const baseMatcher = globstarBase
    ? picomatch.makeRe(globstarBase[1] || '.', { posix: true })
    : matchPattern === '**'
      ? /^\.$/
      : null;

  return tinyGlobSync(pattern, {
    absolute: path.isAbsolute(pattern),
    expandDirectories: false,
    onlyDirectories: true,
  }).flatMap((entry) => {
    let result = entry === '/' ? entry : entry.replace(/\/$/, '');
    if (pattern.startsWith('./') && result !== '.' && !result.startsWith('./')) {
      result = `./${result}`;
    }
    const matchEntry = result.replace(/^\.\//, '');
    if (!matcher.test(matchEntry) || baseMatcher?.test(matchEntry)) return [];
    return [trailingSlash && !result.endsWith('/') ? `${result}/` : result];
  });
}

module.exports = Object.freeze({ globSync });
