"""Disposable browser with allowlisted HTTP routing. Not an OS security boundary.
Install Python Playwright separately. No API credentials or model calls in this script.
"""
import argparse, base64, hashlib, json, pathlib, re, sys, html, datetime, os
from urllib.parse import urlsplit

def browser_context(p):
    # Chromium sandbox stays on. Prefer installed Edge on Windows, bundled Chromium otherwise.
    safe_keys={'PATH','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','HOME','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMFILES','PROGRAMFILES(X86)','COMSPEC','LANG','LC_ALL','DISPLAY','XAUTHORITY','WAYLAND_DISPLAY','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS'}
    browser_env={k:v for k,v in os.environ.items() if k.upper() in safe_keys}
    kwargs = dict(headless=False, chromium_sandbox=True, env=browser_env, args=["--disable-extensions", "--disable-background-networking", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"], proxy={"server":"http://127.0.0.1:9", "bypass":"127.0.0.1"})
    # Playwright's matching bundled Chromium only; no machine-wide Edge fallback.
    kwargs['headless']=args.command=='validate'
    kwargs['channel']='chromium'
    browser=p.chromium.launch(**kwargs)
    context=browser.new_context(service_workers='block', viewport={'width':1100,'height':760}, accept_downloads=args.command=='open')
    if not hasattr(context,'route_web_socket'):
        browser.close(); raise RuntimeError('Playwright >= 1.48 required for websocket blocking')
    context.route_web_socket('**/*', lambda ws: ws.close())
    return browser,context

def validate(context):
    spec=json.loads(pathlib.Path(args.input).read_text(encoding='utf-8')); out=pathlib.Path(args.output); out.mkdir(exist_ok=True,parents=True)
    errors=[]; blocked=[]; snapshots=[]; lifecycle=[]; phase='page_setup'
    wrapper='<!doctype html><meta charset=utf-8><style>body{margin:0;background:#142536}iframe{width:100vw;height:100vh;border:0}</style><script>let events=[];addEventListener("message",e=>{if(e.source===document.querySelector("iframe")?.contentWindow&&e.origin==="null")events.push(e.data)});</script><iframe id="scene" sandbox="allow-scripts" srcdoc="'+html.escape(spec['html'],quote=True)+'"></iframe>'
    def route(r):
        blocked.append(r.request.url[:300]);r.abort()
    context.route('**/*',route)
    page=context.new_page();page.on('popup',lambda other: other.close())
    page.on('close',lambda: lifecycle.append('page_closed'));page.on('crash',lambda: lifecycle.append('page_crashed'));context.on('close',lambda: lifecycle.append('context_closed'))
    page.on('pageerror',lambda e:errors.append(str(e)[:300]));page.on('console',lambda m:errors.append(m.text[:300]) if m.type=='error' else None)
    try:
        phase='offline_document'
        page.set_content(wrapper,wait_until='domcontentloaded',timeout=10000)
        phase='ready_handshake';page.wait_for_function("ch=>events.some(e=>e.channel===ch&&e.kind==='ready')",arg=spec['channel'],timeout=8000)
        phase='cue_sampling'
        for i,cue in enumerate(spec['cues']):
            for progress in (0.2,0.8):
                page.evaluate("([channel,cueId,progress])=>{events=[];document.querySelector('iframe').contentWindow.postMessage({channel,kind:'render',details:{cueId,progress,time:0,playing:false}},'*')}",[spec['channel'],cue,progress])
                page.wait_for_function("([ch,cue])=>events.some(e=>e.channel===ch&&e.kind==='render_ack'&&e.details.cueId===cue)",arg=[spec['channel'],cue],timeout=3500)
                page.wait_for_timeout(80)
                errors.extend(str(e.get('details'))[:300] for e in page.evaluate('events.filter(e=>e.kind==="error")'))
                if len(page.frames)!=2 or page.frames[-1].evaluate('location.href')!='about:srcdoc': raise RuntimeError('Scene navigated away from offline document')
                name=f'cue-{i+1:02d}-{int(progress*100)}.png'; data=page.locator('iframe').screenshot(path=str(out/name),timeout=4000)
                snapshots.append({'cue':cue,'progress':progress,'file':name,'sha256':hashlib.sha256(data).hexdigest()})
    except Exception as e: errors.append(str(e)[:1000])
    infra=bool(lifecycle) or any(re.search(r'target page, context or browser has been closed|browser.*closed|page crashed|connection closed',e,re.I) for e in errors)
    failure=None if not errors and not blocked and len(snapshots)==2*len(spec['cues']) else ('browser_lifecycle' if infra and phase in ('page_setup','offline_document','ready_handshake') and not blocked and not snapshots else 'render_or_policy_failure')
    report={'validator':'r62b-browser-v2','phase':phase,'failure_kind':failure,'lifecycle':lifecycle,'engine':getattr(args,'engine','edge'),'identity':spec['identity'],'passed':not errors and not blocked and len(snapshots)==2*len(spec['cues']),'errors':errors[:50],'blocked_requests':blocked[:50],'snapshots':snapshots,'distinct_screenshots':len(set(s['sha256'] for s in snapshots)),'limitation':'Screenshots and bridge acknowledgments are not educational accuracy, interaction correctness or proof of isolation.'}
    (out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in report.items() if k!='snapshots'}))

def open_lab(context):
    base=f'http://127.0.0.1:{args.port}'
    allowed_get=re.compile(r'^/(?:|player\.js|style\.css|audio/[a-z]+\.wav|speech/[a-f0-9]+\.wav|api/(?:state|sessions|export))$')
    allowed_post=re.compile(r'^/api/(?:authorize|pause|turn|choose|event|frame|inspect|validate|audio|speech)$')
    def route(r):
        req=r.request;u=urlsplit(req.url)
        if f'{u.scheme}://{u.netloc}'!=base: return r.abort()
        try: sub=req.frame.parent_frame is not None
        except Exception: return r.abort()
        if sub:
            if req.method=='GET' and req.is_navigation_request() and re.fullmatch(r'/frame/[a-f0-9]{48}',u.path): return r.continue_()
            return r.abort()
        if (req.method=='GET' and allowed_get.fullmatch(u.path)) or (req.method=='POST' and allowed_post.fullmatch(u.path)):
            return r.continue_(headers={**req.headers,'x-myway-preview-key':args.key})
        return r.abort()
    context.route('**/*',route);page=context.new_page();context.on('page',lambda other: other.close() if other!=page else None)
    def download(d):
        name=d.suggested_filename
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,39}-r62-research\.zip',name): return d.cancel()
        folder=pathlib.Path.home()/'Downloads';folder.mkdir(exist_ok=True)
        dest=folder/name
        if dest.exists(): dest=folder/(dest.stem+'-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')+'.zip')
        d.save_as(str(dest));print('Saved research ZIP: '+str(dest),flush=True)
    page.on('download',download)
    page.goto(base,timeout=15000);print('Disposable Learning Lab opened. Keep terminal open. Ctrl+C to close.')
    while not page.is_closed(): page.wait_for_timeout(500)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('command',choices=['validate','open']);ap.add_argument('--input');ap.add_argument('--output');ap.add_argument('--port',type=int,default=8879);ap.add_argument('--key',default='');ap.add_argument('--engine',choices=['chromium'],default='chromium');args=ap.parse_args()
    if args.command=='open':
        args.key=os.environ.pop('MYWAY_MANAGED_PREVIEW_KEY','')
        if not re.fullmatch(r'[a-f0-9]{48}',args.key): raise RuntimeError('Use managed launcher')
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b,c=browser_context(p)
        try: validate(c) if args.command=='validate' else open_lab(c)
        finally: b.close()
