/** Load unchanged production TypeScript logic for CLI evaluation; never duplicate matching rules. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

export function loadRuntime(root){
  const require = createRequire(import.meta.url);
  // Compile from the application's OWN installed TypeScript dependency.
  const ts = require(path.join(root,'node_modules/typescript/lib/typescript.js'));
  const cache = new Map();
  const allowed = new Map([
    ['identity','sandbox/probe-lab/learning-space/difficulty-identity.ts'],
    ['topic','sandbox/probe-lab/learning-space/topic-memory-preview.ts'],
    ['assessment','sandbox/probe-lab/learning-space/assessment-core.ts'],
    ['parser','sandbox/probe-lab/local-assessment/parse-model-json.ts'],
    ['verifier','sandbox/probe-lab/learning-space/topic-association-verifier.ts'],
    ['adjudicator','sandbox/probe-lab/learning-space/memory-adjudication.ts'],
    ['cost','sandbox/probe-lab/local-assessment/model-token-usage.ts'],
  ]);
  const ids = new Map([['@/sandbox/probe-lab/local-assessment/parse-model-json','parser']]);
  function load(key){
    if(cache.has(key))return cache.get(key);
    if(!allowed.has(key))throw Error('Unapproved runtime import: '+key);
    const rel=allowed.get(key);
    const source=fs.readFileSync(path.join(root,...rel.split('/')),'utf8');
    const transpiled=ts.transpileModule(source,{fileName:rel,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}});
    const errors=(transpiled.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
    if(errors.length)throw Error('Runtime TypeScript syntax errors in '+rel);
    const mod={exports:{}};
    cache.set(key,mod.exports);
    // Only the assessment validator has a dependency, and it is restricted to a declared local module.
    const requireSafe=(id)=>{const item=ids.get(id);if(!item)throw Error('Disallowed runtime dependency: '+id);return load(item);};
    new Function('require','module','exports',transpiled.outputText)(requireSafe,mod,mod.exports);
    cache.set(key,mod.exports);
    return mod.exports;
  }
  return {identity:load('identity'),topic:load('topic'),assessment:load('assessment'),verifier:load('verifier'),adjudicator:load('adjudicator'),cost:load('cost')};
}
