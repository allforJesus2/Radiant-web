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
