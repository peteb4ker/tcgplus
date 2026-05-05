// Bumps the `version` field in manifest.json and package.json in lockstep.
//
// Usage: node tools/bump-version.js X.Y.Z
//        npm run release -- X.Y.Z

const fs = require('node:fs');
const path = require('node:path');

const next = process.argv[2];
if (!next || !/^\d+\.\d+\.\d+$/.test(next)) {
  console.error('Usage: node tools/bump-version.js X.Y.Z');
  process.exit(1);
}

const targets = [path.resolve(__dirname, '..', 'manifest.json'), path.resolve(__dirname, '..', 'package.json')];

for (const file of targets) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const previous = json.version;
  json.version = next;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log(`${path.basename(file)}: ${previous} → ${next}`);
}

console.log(`\nNext: commit, open a PR titled "chore: release v${next}", merge, then:`);
console.log(`  git tag v${next}`);
console.log(`  git push origin v${next}`);
