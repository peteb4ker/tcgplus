# Changelog

All notable changes to TCGPlus are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project loosely follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-05-03

### Added

- Pure helpers extracted to `lib.js` and shared between the content script and `node --test`-based unit tests.
- Prettier configuration (`.prettierrc.json`) and `npm run format:check` enforced in CI.
- CodeQL workflow for JavaScript security analysis on push, PR, and weekly cron.
- Dependabot configuration covering GitHub Actions and npm dev dependencies.
- Pull request template, `SECURITY.md`, and this `CHANGELOG.md`.

### Changed

- Two CI jobs: `Validate` (manifest, syntax, formatting) and `Test` (unit tests).
- `main` is now protected: PRs required, force-push blocked, status checks must pass before merge.

## [0.1.0] - 2026-04-30

Initial published source.

### Added

- Vendor location badges (home / nearby / international / other US).
- Click-to-filter floating panel by tier.
- Price-vs-market chip with continuous color gradient.
- Shipping chip (included / standard / high) inline on each listing.
- Purple Deal chip when all-in cost beats market price, factoring in per-seller cart subtotal and TCGplayer's `Free Shipping on Orders Over $5` promo.
- Cart subtotal rendered next to the header cart count.
- Settings drawer: home state, nearby states, hide-on-page checkboxes (breakdown / recommendations / footer), Always Near Mint, Always hide out of stock.
- Search-page support (`/search/*`) in addition to product pages.
