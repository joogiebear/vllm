#!/usr/bin/env node
// Import gate (docs/STABILITY-DESIGN.md, section 1, build task 3).
//
// Reads every file in src/ and src/idle/ and fails when a named import
// from a local file (./ or ../) is not exported by that file. Catches
// broken import names before they reach the browser.
//
// One line per violation; exits non-zero on any violation.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');
const DIRS = ['src', path.join('src', 'idle')];

// Collect the export names of a module source:
//  - export const/let/var x, export (async) function x, export class x
//  - export { a, b as c } (the exported name is c when aliased)
function exportNames(source) {
  const names = new Set();
  const decl = /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  const fn = /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
  const cls = /export\s+class\s+([A-Za-z_$][\w$]*)/g;
  for (const re of [decl, fn, cls]) {
    let m;
    while ((m = re.exec(source))) names.add(m[1]);
  }
  let list;
  const listRe = /export\s*\{([^}]*)\}/g;
  while ((list = listRe.exec(source))) {
    for (const item of list[1].split(',')) {
      const parts = item.trim().split(/\s+as\s+/);
      if (parts.length) names.add(parts[parts.length - 1].trim());
    }
  }
  return names;
}

// Scan a module source for named imports from local files. Yields
// { spec, name } for every imported name; spec is the resolved target
// path (query string stripped).
function localNamedImports(source, fromDir) {
  const found = [];
  const re = /^\s*import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/gm;
  let m;
  while ((m = re.exec(source))) {
    const spec = m[2];
    if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
    const target = path.resolve(fromDir, spec.split('?')[0]);
    for (const item of m[1].split(',')) {
      const name = item.trim().split(/\s+as\s+/)[0].trim();
      if (name) found.push({ spec: target, name });
    }
  }
  return found;
}

const files = [];
for (const dir of DIRS) {
  const abs = path.join(REPO, dir);
  for (const entry of fs.readdirSync(abs)) {
    if (entry.endsWith('.js')) files.push(path.join(abs, entry));
  }
}

const errors = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const rel = path.relative(REPO, file);
  for (const { spec, name } of localNamedImports(source, path.dirname(file))) {
    if (!fs.existsSync(spec)) {
      errors.push(`${rel}: import "${name}" from missing file ${path.relative(REPO, spec)}`);
      continue;
    }
    const names = exportNames(fs.readFileSync(spec, 'utf8'));
    if (!names.has(name)) {
      errors.push(`${rel}: "${name}" is not exported by ${path.relative(REPO, spec)}`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`);
  console.error(`FAIL ${errors.length} broken import(s) in ${files.length} files`);
  process.exit(1);
}
console.log(`ok: all named imports resolve in ${files.length} files`);
