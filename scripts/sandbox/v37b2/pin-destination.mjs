#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';
import {parseEnv,assertDestinationPin,supabaseUrl,key,sha,checkDifferent,loadBoundary} from './live-utilities.mjs';
const [targetArg,originalArg]=process.argv.slice(2);
if(!targetArg||!originalArg)throw Error('Usage: pin-destination ROOT ORIGINAL');
const target=path.resolve(targetArg),original=path.resolve(originalArg);
const src=parseEnv(path.join(original,'.env.local'));
const dst=parseEnv(path.join(target,'.env.local'));
checkDifferent(src,dst);
const b=loadBoundary(target);
if(sha(supabaseUrl(src))!==b.original_supabase_url_sha256||sha(key(src))!==b.original_supabase_service_key_sha256)throw Error('Original baseline changed');
const pinPath=path.join(target,'scripts/sandbox/v37b2/sandbox-destination.json');
if(fs.existsSync(pinPath))throw Error('Destination pin already exists');
const pin={schema:'myway-v37b2-destination-v1',ready:true,url_sha256:sha(supabaseUrl(dst)),service_key_sha256:sha(key(dst)),
  setup_method:'verified-empty-experimental-project',original_project_writes:false};
fs.writeFileSync(pinPath,JSON.stringify(pin,null,2)+'\n',{flag:'wx'});
assertDestinationPin(target,src,dst);
console.log('V3.7B.2 DESTINATION PIN PASS');
