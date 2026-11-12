#!/usr/bin/env node
/** Read-only preflight: real local S60 embedding adapter; no API, database or vector persistence. */
import {localMiniLM} from './s16b60-retrieval.mjs';
const args=process.argv.slice(2);
if(args.length>2||(args.length===2&&args[0]!=='--url'))throw Error('Usage: node s62a-embeddings-check.mjs [--url http://127.0.0.1:8001/embed]');
const url=args[1]??'http://127.0.0.1:8001/embed';
try{
 const [v]=await localMiniLM(['S62A local embeddings connectivity probe'],{url});
 console.log(`S62A REAL LOCAL EMBEDDINGS PASS: /embed returned vector dimension ${v.length}; no lexical fallback, API charges, DB or vector writes. Connectivity is NOT evidence of good retrieval.`);
}catch(e){console.error('S62A LOCAL EMBEDDINGS FAIL: '+String(e?.message??e).slice(0,450));process.exitCode=1;}
