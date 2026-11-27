"""Offline, deterministic cue replay. No learner browser or event-store access."""
import json,sys,os,html,math,shutil,subprocess,hashlib,wave
from pathlib import Path

def ffmpeg_path():
    p=shutil.which('ffmpeg')
    if p:return p
    try:
        import imageio_ffmpeg
    except ImportError:
        # Only modify MyWay's private existing venv, never the system environment.
        if sys.prefix==sys.base_prefix or 'r62b4-browser-runtime' not in sys.prefix:raise RuntimeError('FFmpeg unavailable (private runtime not present)')
        subprocess.run([sys.executable,'-m','pip','install','imageio-ffmpeg==0.6.0'],check=True,timeout=120,stdout=subprocess.DEVNULL)
        import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()

def render(job):
    from playwright.sync_api import sync_playwright
    fps=job['fps']; w=job['width']; h=job['height']; ff=ffmpeg_path(); root=Path(job['output']).parent
    frame=Path(job['frame']).read_text(encoding='utf-8')
    # Meta CSP cannot implement sandbox; the outer iframe supplies it instead.
    csp=job['csp'].replace('; sandbox allow-scripts','')
    frame=frame.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+html.escape(csp,quote=True)+'">',1)
    parent='''<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#091320;overflow:hidden}iframe{width:100vw;height:100vh;border:0;display:block}#caption{position:fixed;bottom:10px;left:5%;right:5%;text-align:center;background:#07101ee8;color:white;padding:8px;font:18px system-ui;border-radius:8px;display:none}</style></head><body><iframe sandbox="allow-scripts" srcdoc="'''+html.escape(frame,quote=True)+'''"></iframe><div id="caption"></div><script>window.events=[];window.addEventListener('message',e=>{if(e.source===document.querySelector('iframe').contentWindow){events.push(e.data);if(events.length>20)events.shift();}});</script></body></html>'''
    videoOnly=root/'video-only.mp4';audioFile=root/'audio.wav';samples=bytearray();timeline=[];cursor=0;blocked=[]
    cmd=[ff,'-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',str(fps),'-vcodec','png','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','24','-pix_fmt','yuv420p',str(videoOnly)]
    with open(root/'ffmpeg.log','wb') as log:
        proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=log)
        try:
            with sync_playwright() as pw:
                args=['--disable-dev-shm-usage']
                # Use Playwright's paired Chromium on Windows; test override only on Linux.
                launch={'headless':True,'args':args}
                if sys.platform.startswith('linux') and shutil.which('chromium'):launch.update(executable_path=shutil.which('chromium'),args=args+['--no-sandbox'])
                browser=pw.chromium.launch(**launch)
                try:
                    ctx=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=1,offline=True,service_workers='block');ctx.route('**/*',lambda r:(blocked.append(r.request.url[:300]),r.abort()))
                    page=ctx.new_page();page.set_content(parent,wait_until='load',timeout=12000);page.wait_for_function('events.some(e=>e.kind==="ready"||e.kind==="error")',timeout=10000)
                    if page.evaluate('events.some(e=>e.kind==="error")'):raise RuntimeError('Scene initialization rejected')
                    for cue in job['cues']:
                        count=max(1,math.ceil(cue['duration']*fps));framesize=count*24000//fps;start=cursor/fps
                        if cue['audio']:
                            pcm=subprocess.check_output([ff,'-hide_banner','-loglevel','error','-i',cue['audio'],'-ar','24000','-ac','1','-f','s16le','pipe:1'],timeout=20)
                            if abs(len(pcm)/48000-cue['duration'])>.15:raise RuntimeError('Measured audio differs from replay cue')
                        else:pcm=b''
                        samples.extend(pcm[:framesize*2].ljust(framesize*2,b'\0'))
                        page.evaluate('cue=>{const c=document.querySelector("#caption");c.textContent=cue.text;c.style.display=cue.audio?"none":"block";}',{'text':cue['text'],'audio':bool(cue['audio'])})
                        for i in range(count):
                            page.evaluate('x=>{events=[];document.querySelector("iframe").contentWindow.postMessage({channel:x.channel,kind:"render",details:{cueId:x.cue,progress:x.progress,time:x.time,playing:true}},"*");}',{'channel':job['channel'],'cue':cue['id'],'progress':min(1,i/fps/cue['duration']),'time':start+i/fps})
                            page.wait_for_function('events.some(e=>e.kind==="render_ack"||e.kind==="error")',timeout=4000)
                            if page.evaluate('events.some(e=>e.kind==="error")'):raise RuntimeError('Scene rendering rejected')
                            proc.stdin.write(page.screenshot(type='png',animations='disabled',timeout=5000));cursor+=1
                        timeline.append({'cue_id':cue['id'],'start':start,'end':cursor/fps,'frames':count,'source_audio_seconds':cue['duration'] if cue['audio'] else None,'audio_sha256':cue['audio_sha256'],'provider':cue['provider']})
                    if blocked:raise RuntimeError('Unexpected network request during replay')
                finally:browser.close()
            proc.stdin.close()
            if proc.wait(timeout=40):raise RuntimeError('Video encoder failed')
        finally:
            if proc.poll() is None:proc.kill();proc.wait()
    with wave.open(str(audioFile),'wb') as a:a.setnchannels(1);a.setsampwidth(2);a.setframerate(24000);a.writeframes(samples)
    subprocess.run([ff,'-hide_banner','-loglevel','error','-y','-i',str(videoOnly),'-i',str(audioFile),'-c:v','copy','-c:a','aac','-b:a','96k','-movflags','+faststart',str(job['output'])],check=True,timeout=40)
    Path(job['manifest']).write_text(json.dumps({'status':'complete','kind':'independent_linear_replay_not_actual_learner_session','artifact_id':job['artifact_id'],'artifact_sha256':job['artifact_sha256'],'html_sha256':job['html_sha256'],'fps':fps,'width':w,'height':h,'frame_count':cursor,'duration_seconds':cursor/fps,'cues':timeline,'limitations':['Rendered through the restricted worker, not a capture of the live browser.','No learner clicks, pauses or probe answers are replayed. See original learner events.','Cue boundaries rounded up to the next video frame; silence pads each cue.','Only supported HTML/SVG scenes, up to 180 seconds.','Audio tracks use cached exact cue resources or silence with captions.']},indent=2),encoding='utf-8')
if __name__=='__main__':
    try:render(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8')))
    except Exception as e:print(type(e).__name__+': '+str(e)[:600],file=sys.stderr);sys.exit(1)
