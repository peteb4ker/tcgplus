// Bumps the version in manifest.json, package.json and package-lock.json in
// lockstep.
//
// Usage: node tools/bump-version.js X.Y.Z
//        npm run release -- X.Y.Z
//
// Only the version strings are replaced, in place. Re-serializing the files
// with JSON.stringify would reflow manifest.json's short arrays onto one item
// per line, which Prettier rejects, so the release commit would fail the
// pre-commit gate (#199).

const fs = require('node:fs');
const path = require('node:path');

const next = process.argv[2];
if (!next || !/^\d+\.\d+\.\d+$/.test(next)) {
  console.error('Usage: node tools/bump-version.js X.Y.Z');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');

/**
 * Replace the first match of `pattern` (which must capture the text before
 * the version string as group 1) with that prefix plus `next`.
 *
 * @param {string} text
 * @param {RegExp} pattern
 * @param {string} label  used in the error if nothing matches
 */
function replaceVersion(text, pattern, label) {
  if (!pattern.test(text)) throw new Error(`could not find ${label}`);
  return text.replace(pattern, (_, prefix) => `${prefix}${next}"`);
}

// Top-level "version" field: the first one in the file. In package-lock.json
// this is the lockfile's own version, which comes before "packages".
const TOP_LEVEL = /^(\s*"version":\s*")[^"]*"/m;
// package-lock.json's root package entry, packages[""].version. Its fields
// before "version" contain no nested objects, so [^{}] can't skip past it.
const LOCK_ROOT_PACKAGE = /("packages":\s*\{\s*"":\s*\{[^{}]*?"version":\s*")[^"]*"/;

const targets = [
  { file: 'manifest.json', patterns: [[TOP_LEVEL, 'version']] },
  { file: 'package.json', patterns: [[TOP_LEVEL, 'version']] },
  {
    file: 'package-lock.json',
    patterns: [
      [TOP_LEVEL, 'version'],
      [LOCK_ROOT_PACKAGE, 'packages[""].version'],
    ],
  },
];

// Compute every edit and check it landed where intended before writing any
// file, so a failure can't leave the three files on different versions.
const edits = targets.map(({ file, patterns }) => {
  const full = path.join(root, file);
  const before = fs.readFileSync(full, 'utf8');
  const previous = JSON.parse(before).version;
  let after = before;
  for (const [pattern, label] of patterns) after = replaceVersion(after, pattern, `${label} in ${file}`);
  const parsed = JSON.parse(after);
  const ok = parsed.version === next && (file !== 'package-lock.json' || parsed.packages[''].version === next);
  if (!ok) throw new Error(`version not updated correctly in ${file}`);
  return { file, full, previous, after };
});

for (const { file, full, previous, after } of edits) {
  fs.writeFileSync(full, after);
  console.log(`${file}: ${previous} → ${next}`);
}

console.log(`\nNext: commit, open a PR titled "chore: release v${next}", merge, then:`);
console.log(`  git tag v${next}`);
console.log(`  git push origin v${next}`);
