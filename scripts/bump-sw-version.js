/**
 * Bump the service worker cache version before deploy.
 *
 * public/service-worker.js uses CACHE_VERSION as the Cache Storage bucket name.
 * Changing it invalidates old cached HTML/JS so clients fetch fresh assets after
 * a deploy (including new USDA NDJSON under public/assets/processed/).
 *
 * Run automatically by `npm run deploy`, after preprocess. Uses the current git
 * commit short hash so each deploy gets a unique cache id without manual edits.
 */
'use strict';

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const swPath = path.join(__dirname, '../public/service-worker.js');
const hash = execSync('git rev-parse --short HEAD').toString().trim();
const version = `v${hash}`;

let content = fs.readFileSync(swPath, 'utf8');
content = content.replace(
  /const CACHE_VERSION = '.*?'/,
  `const CACHE_VERSION = '${version}'`
);
fs.writeFileSync(swPath, content);
console.log(`[bump-sw-version] CACHE_VERSION set to ${version}`);
