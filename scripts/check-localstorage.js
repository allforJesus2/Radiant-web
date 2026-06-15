#!/usr/bin/env node
/**
 * Guardrail: no direct localStorage outside storage.js (and debug.html).
 * Zero dependencies — run via: npm run lint:storage
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const ALLOWED = new Set([
    path.join(ROOT, 'storage.js'),
    path.join(ROOT, 'debug.html'),
]);
function walk(dir, out) {
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) {
            walk(full, out);
        } else if (/\.(js|html)$/.test(name)) {
            out.push(full);
        }
    }
}

function stripComments(text) {
    return text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
}

function stripStrings(text) {
    return text
        .replace(/'(?:\\.|[^'\\])*'/g, "''")
        .replace(/"(?:\\.|[^"\\])*"/g, '""')
        .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

const files = [];
walk(ROOT, files);

function scanFile(file, text) {
    if (file.endsWith('.html')) {
        const blocks = [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
        return blocks.map((m) => stripStrings(stripComments(m[1]))).join('\n');
    }
    return stripStrings(stripComments(text));
}

const violations = [];
for (const file of files) {
    if (ALLOWED.has(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const code = scanFile(file, text);
    if (/\blocalStorage\b/.test(code)) {
        const rel = path.relative(path.join(__dirname, '..'), file);
        violations.push(rel);
    }
}

if (violations.length) {
    console.error('Direct localStorage usage outside storage.js:\n');
    violations.forEach((f) => console.error('  ' + f));
    console.error('\nRoute reads/writes through RadiantStorage instead.');
    process.exit(1);
}

console.log('OK: no direct localStorage outside storage.js');
