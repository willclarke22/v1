/** Only paths this experimental ZIP is allowed to own. Portable Windows/POSIX rules. */
import path from 'node:path';
const allowedPrefixes=[
  'app/sandbox/probe-lab/learning-space/',
  'lib/sandbox/',
  'scripts/sandbox/',
];
/** The sole permitted root-level release file is tsconfig.json. */
export function assertSafeManifestPath(file){
  if(typeof file!=='string'||file.length===0||file.length>240||
     file.includes('\\')||file.includes('\0')||file.includes(':')||
     file.startsWith('/')||file.includes('//')||
     path.posix.normalize(file)!==file||
     file.split('/').some(segment=>!segment||segment==='.'||segment==='..')){
    throw new Error('Unsafe release manifest path: '+String(file));
  }
  if(file!=='tsconfig.json'&&!allowedPrefixes.some(prefix=>file.startsWith(prefix))){
    throw new Error('Outside experimental path allowlist: '+file);
  }
  return file;
}
