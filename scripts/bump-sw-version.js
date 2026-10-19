/**
 * Bump the service worker cache version before deploy.
 *
 * public/service-worker.js uses CACHE_VERSION as the Cache Storage bucket name.
 * Changing it invalidates old cached HTML/JS so clients fetch fresh assets after
 * a deploy (including new USDA NDJSON under public/assets/processed/).
 *
 * The version is derived from a hash of the deployed file contents (service-
 * worker.js itself excluded), so it changes on every deploy where any asset
 * differs — even uncommitted edits. The browser detects a changed service
 * worker script on update checks, which is what makes "Check for updates"
 * (RadiantSWUpdate) find new versions.
 *
 * Run automatically by the firebase.json hosting predeploy hook, and by
 * `npm run bump-sw-version`.
 */
'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const swPath = path.join(publicDir, 'service-worker.js');

function fileHash(filePath) {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
}

// Deterministic walk over all deployable files (sorted), excluding the service
// worker itself so the version cannot be influenced by its own stamp.
function collectFiles(dir, out) {
    for (const name of fs.readdirSync(dir).sort()) {
        const full = path.join(dir, name);
        if (full === swPath) continue;
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            collectFiles(full, out);
        } else if (stat.isFile()) {
            out.push({ rel: path.relative(publicDir, full), full });
        }
    }
}

const files = [];
collectFiles(publicDir, files);

const digest = crypto.createHash('sha256');
for (const file of files) {
    digest.update(file.rel);
    digest.update('\n');
    digest.update(fileHash(file.full));
    digest.update('\n');
}

const version = 'v' + digest.digest('hex').slice(0, 12);
const source = fs.readFileSync(swPath, 'utf8');
if (source.includes(`CACHE_VERSION = '${version}'`)) {
    console.log(`[bump-sw-version] CACHE_VERSION already ${version} (no changes since last deploy)`);
    process.exit(0);
}

const updated = source.replace(
    /const CACHE_VERSION = '.*?'/,
    `const CACHE_VERSION = '${version}'`
);
fs.writeFileSync(swPath, updated);
console.log(`[bump-sw-version] CACHE_VERSION set to ${version} (${files.length} files hashed)`);