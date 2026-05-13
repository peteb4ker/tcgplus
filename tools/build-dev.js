// Build the dev flavour of the extension into ./.dev so it can be loaded
// unpacked in Chrome alongside the production extension from the Web Store.
//
// The two versions get different IDs (CWS assigns the prod one; the unpacked
// one has no `key` in its manifest so Chrome generates a fresh ID), and the
// dev manifest changes name / short_name / description so they're clearly
// distinguishable in chrome://extensions. Both can be toggled independently.
//
// Files are copied (not symlinked) because Chrome on macOS silently refuses
// to read content-script JS through symlinks — the extension would load
// without errors but its scripts would never fire. After editing source
// files, rerun this script and hit "Reload" on the unpacked extension in
// chrome://extensions.
//
// Usage:
//   npm run dev:build
//   # Then in Chrome: chrome://extensions → "Load unpacked" → pick `.dev/`

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DEV = path.join(ROOT, '.dev');

// Everything Chrome needs at runtime, mirrored from `release.yml`'s zip step.
// icons/icon.svg is build-time-only (used by render-promo-tile.js) so it's
// omitted here, same as in the production zip.
const EXPOSE = ['lib.js', 'storage.js', 'content.js', 'content.css', 'background.js', 'icons', 'options'];

/**
 * Recursive copy. Node 16+ has fs.cpSync, but call it explicitly with the
 * options we need so behaviour is obvious in code review.
 *
 * @param {string} src
 * @param {string} dest
 */
function copyRecursive(src, dest) {
  fs.cpSync(src, dest, { recursive: true, dereference: true });
}

function rebuild() {
  fs.rmSync(DEV, { recursive: true, force: true });
  fs.mkdirSync(DEV);

  for (const f of EXPOSE) {
    const src = path.join(ROOT, f);
    if (!fs.existsSync(src)) {
      console.error(`Missing source: ${src}`);
      process.exit(1);
    }
    copyRecursive(src, path.join(DEV, f));
  }

  /** @type {Record<string, unknown>} */
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  manifest.name = 'TCGPlus (dev)';
  manifest.short_name = 'TCGPlus dev';
  manifest.description = '[dev build] ' + manifest.description;
  // Production has a homepage URL pointing at the public repo; the dev build
  // doesn't need it and stripping it removes one more visual cue that this
  // is the published extension.
  delete manifest.homepage_url;
  fs.writeFileSync(path.join(DEV, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

rebuild();

console.log(`Built dev extension at ${DEV}`);
console.log('');
console.log('Next steps:');
console.log('  1. Open chrome://extensions');
console.log('  2. Enable Developer mode (top right) if not already on');
console.log('  3. Click "Load unpacked" and pick the .dev directory');
console.log('  4. Toggle the production "TCGPlus" extension off while testing');
console.log('');
console.log('After code edits, rerun `npm run dev:build` and hit "Reload" on the unpacked extension.');
