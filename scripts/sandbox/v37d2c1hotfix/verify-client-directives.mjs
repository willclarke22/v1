#!/usr/bin/env node
// Next.js/Turbopack client-directive regression guard for V3.7D.2C.1.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const root = path.resolve(process.argv[2] || process.cwd());
const require = createRequire(import.meta.url);
const ts = require(path.join(root, 'node_modules/typescript'));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const clientFiles = [
  'sandbox/probe-lab/learning-space/learning-turn.client.ts',
  'sandbox/probe-lab/learning-space/learning-space-preview.tsx',
  'sandbox/probe-lab/learning-space/glm-client.ts',
  'sandbox/probe-lab/learning-space/workbench.tsx',
];
function checkDirective(fileName, source) {
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const first = tree.statements[0];
  if (!first || !ts.isExpressionStatement(first) || !ts.isStringLiteral(first.expression)
      || first.expression.text !== 'use client') {
    throw Error('Next/Turbopack build guard: "use client" must precede all imports in '+fileName);
  }
  const count = tree.statements.filter(st => ts.isExpressionStatement(st)
      && ts.isStringLiteral(st.expression) && st.expression.text === 'use client').length;
  if (count !== 1) throw Error('Next/Turbopack build guard: duplicate client directive: '+fileName);
}
// Prove regression test actually detects the prior (import-first) error.
const regression = 'import { x } from "./x";\n"use client";\nexport const a=x;';
let rejected = false;
try { checkDirective('regression.client.ts', regression); } catch { rejected = true; }
if (!rejected) throw Error('Client directive regression test did not reject original import-first failure');
const markerFile = path.join(root, 'scripts/sandbox/v37d2c1/installation.json');
const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
if (marker.schema !== 'myway-v37d2c1-install-v1' || marker.database_writes !== false
    || marker.write_policy !== 'shadow_verifier_no_new_write_authority') {
  throw Error('Original shadow-verifier marker safety policy changed');
}
for (const relative of clientFiles) {
  const absolute = path.join(root, relative);
  checkDirective(relative, fs.readFileSync(absolute, 'utf8'));
  if (!fs.existsSync(absolute)) throw Error('Missing client file: '+relative);
}
const rel = 'sandbox/probe-lab/learning-space/learning-turn.client.ts';
if (marker.file_hashes?.[rel] !== digest(path.join(root, rel))) {
  throw Error('D2C1 marker does not match corrected client module');
}
for (const forbidden of ['app/api/message/route.ts', 'proxy.ts', 'next.config.ts']) {
  if (marker.file_hashes?.[forbidden]) throw Error('Unexpected broadened D2C1 payload scope: '+forbidden);
}
console.log('V3.7D.2C.1 CLIENT DIRECTIVE HOTFIX PASS: all four client directives first; known failing order rejected; original shadow policy and marker checksum preserved.');
