import {createServer,branchCheck} from '../r62b3/server.mjs';
import {validateRendered} from './render-review.mjs';
branchCheck();const p=process.argv.indexOf('--port'),port=p<0?8879:Number(process.argv[p+1]);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
const previewKey=process.env.MYWAY_MANAGED_PREVIEW_KEY;delete process.env.MYWAY_MANAGED_PREVIEW_KEY;
if(!/^[a-f0-9]{48}$/.test(previewKey??''))throw Error('Use the managed launcher');
const server=createServer({allowReal:!process.argv.includes('--offline'),allowSpeech:!process.argv.includes('--offline'),allowExperimentalRender:true,previewKey,renderValidator:validateRendered});
server.on('error',e=>{console.error('Lab startup failed: '+e.message);process.exitCode=1;});server.listen(port,'127.0.0.1',()=>console.log('MYWAY_MANAGED_READY '+port));
