"""Offline actual browser smoke; never calls a model or cloud storage."""
import argparse,html,json,os,pathlib,shutil,subprocess,sys,tempfile,time
from playwright.sync_api import sync_playwright
HERE=pathlib.Path(__file__).resolve().parent

def run(dest):
    dest.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        root=pathlib.Path(tmp);subprocess.run(['node',str(HERE/'renderer-fixtures.mjs'),str(root)],check=True)
        specs=json.loads((root/'fixtures.json').read_text());results={};blocked=[]
        with sync_playwright() as p:
            args=['--disable-dev-shm-usage'];opts={'headless':True,'args':args}
            if sys.platform.startswith('linux') and shutil.which('chromium'):opts.update(executable_path=shutil.which('chromium'),args=args+['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader'])
            browser=p.chromium.launch(**opts)
            try:
                for name,spec in specs['fixtures'].items():
                    ctx=browser.new_context(viewport={'width':900,'height':650},offline=True,service_workers='block');ctx.route('**/*',lambda r:(blocked.append(r.request.url[:160]),r.abort()));page=ctx.new_page()
                    try:
                        frame=(root/spec['file']).read_text();csp=spec['csp'].replace('; sandbox allow-scripts','');frame=frame.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+html.escape(csp,quote=True)+'">',1)
                        page.set_content('<iframe style="width:800px;height:600px;border:0" sandbox="allow-scripts" srcdoc="'+html.escape(frame,quote=True)+'"></iframe><script>window.events=[];addEventListener("message",e=>{if(e.source===document.querySelector("iframe").contentWindow)events.push(e.data)})</script>')
                        page.wait_for_function('events.some(e=>e.kind==="ready"||e.kind==="error")',timeout=10000)
                        def check():
                            err=page.evaluate('events.find(e=>e.kind==="error")');assert not err,err
                        check();images=[]
                        def render(progress):
                            page.evaluate('x=>{events=[];document.querySelector("iframe").contentWindow.postMessage({channel:x.channel,kind:"render",details:{cueId:"one",progress:x.p,time:x.p*10,playing:false}},"*")}',{'channel':spec['channel'],'p':progress})
                            page.wait_for_function('events.some(e=>e.kind==="render_ack"||e.kind==="error")',timeout=10000);check();assert abs(page.evaluate('events.find(e=>e.kind==="render_ack").details.time')-progress*10)<.0001
                            page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');page.wait_for_timeout(80)
                            return page.frame_locator('iframe').locator('canvas').screenshot(timeout=10000)
                        for progress in [.15,.8,.15]:images.append(render(progress))
                        assert images[0]!=images[1],'Rendered frames did not change';assert images[0]==images[2],'Backward seek did not reconstruct exact frame'
                        (dest/(name+'-early.png')).write_bytes(images[0]);(dest/(name+'-late.png')).write_bytes(images[1]);interaction=False
                        if name in ('canvas','three'):
                            page.evaluate('events=[]');page.frame_locator('iframe').locator('button').click();page.wait_for_function('events.some(e=>e.kind==="action"||e.kind==="error")',timeout=10000);check();page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');page.wait_for_timeout(80);changed=page.frame_locator('iframe').locator('canvas').screenshot();assert changed!=images[2],'Paused interaction did not change canvas';(dest/(name+'-interaction.png')).write_bytes(changed);interaction=True
                            if name=='canvas':
                                page.evaluate('events=[]');page.frame_locator('iframe').locator('canvas').click(position={'x':600,'y':100});page.wait_for_function('events.some(e=>e.kind==="action"&&e.details.details.x!==undefined)',timeout=10000);assert .7<page.evaluate('events.find(e=>e.kind==="action"&&e.details.details.x!==undefined).details.details.x')<.9
                                page.evaluate('events=[]');page.frame_locator('iframe').locator('canvas').dblclick(position={'x':300,'y':200});page.wait_for_function('events.some(e=>e.kind==="mark_gesture")',timeout=10000)
                        page.evaluate('ch=>{events=[];document.querySelector("iframe").contentWindow.postMessage({channel:ch,kind:"snapshot",details:{request:"smoke"}},"*")}',spec['channel']);page.wait_for_function('events.some(e=>e.kind==="snapshot"||e.kind==="error")',timeout=10000);check()
                        results[name]={'status':'passed','forward_backward_exact_pixel_match':True,'paused_interaction':interaction,'snapshot':page.evaluate('events.find(e=>e.kind==="snapshot").details.state')};print('PASS '+name+' forward/backward rendering, snapshot'+(', paused interaction' if interaction else ''),flush=True)
                    except Exception as e:results[name]={'status':'failed','error':str(e)[:600]};print('FAIL '+name+': '+str(e)[:350],flush=True)
                    finally:ctx.close()
            finally:browser.close()
        if not specs['capabilities']['three_core']:results['three']={'status':'skipped','reason':'Installed Three.js core unavailable'}
        report={'capabilities':specs['capabilities'],'results':results,'blocked_network_attempts':blocked,'paid_calls':0,'cloud_writes':0,'limitation':'Small procedural smoke fixtures; not a real model generation or learning quality test.'};(dest/'renderer-check.json').write_text(json.dumps(report,indent=2));print('Report: '+str(dest/'renderer-check.json'),flush=True)
        return 1 if blocked or any(r['status']=='failed' for r in results.values()) else 0
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);sys.exit(run(pathlib.Path(ap.parse_args().output).resolve()))
