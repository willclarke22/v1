"""One-command launcher. No paid operations occur here. Own only child processes we start."""
import argparse, importlib.util, os, pathlib, queue, secrets, socket, subprocess, sys, threading, venv
sys.dont_write_bytecode=True
from importlib.metadata import version, PackageNotFoundError

HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[3]
BRANCH='myway/learning-sandbox-v3_7a'

def check_root():
    branch=subprocess.check_output(['git','-C',str(ROOT),'branch','--show-current'],text=True).strip()
    if branch!=BRANCH: raise RuntimeError('Protected research branch required.')

PLAYWRIGHT_VERSION='1.65.2'

def setup_env():
    # Use a private browser cache; do not rely on global package or browser installs.
    os.environ['PLAYWRIGHT_BROWSERS_PATH']=str(ROOT/'.myway-patch-backups'/'r62b4-browser-runtime'/'browsers')
    return {k:v for k,v in os.environ.items() if k.upper() not in {'OPENAI_API_KEY','MYWAY_OPENAI_API_KEY','MYWAY_MANAGED_PREVIEW_KEY','PYTHONPATH','PYTHONHOME'}}

def ensure_python():
    folder=ROOT/'.myway-patch-backups'/'r62b4-browser-runtime'/'venv'
    py=folder/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
    env=setup_env()
    if not py.exists():
        print('Preparing private MyWay browser environment (one-time setup)...',flush=True)
        venv.EnvBuilder(with_pip=True).create(folder)
    check=subprocess.run([str(py),'-I','-c',f'from importlib.metadata import version; assert version("playwright")=={PLAYWRIGHT_VERSION!r}'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if check.returncode:
        print('Installing pinned Playwright '+PLAYWRIGHT_VERSION+' in private environment...',flush=True)
        subprocess.check_call([str(py),'-I','-m','pip','--disable-pip-version-check','install','playwright=='+PLAYWRIGHT_VERSION],env=env)
    check=subprocess.run([str(py),'-I','-c','from pathlib import Path; from playwright.sync_api import sync_playwright; p=sync_playwright().start(); ok=Path(p.chromium.executable_path).is_file(); p.stop(); assert ok'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if check.returncode:
        print('Downloading the matching Chromium browser (one-time setup)...',flush=True)
        subprocess.check_call([str(py),'-I','-m','playwright','install','chromium'],env=env)
    return py

def listening(port):
    try:
        with socket.create_connection(('127.0.0.1',port),timeout=.3): return True
    except OSError: return False

def stop_owned(child):
    if child and child.poll() is None:
        child.terminate()
        try: child.wait(timeout=8)
        except subprocess.TimeoutExpired:
            child.kill(); child.wait(timeout=5)

def start_lab(port,offline,python,key):
    if listening(port): raise RuntimeError(f'Port {port} already in use. Close the previous MyWay server and try again.')
    env={**os.environ,'MYWAY_MANAGED_PREVIEW_KEY':key,'MYWAY_PYTHON':str(python)}
    cmd=['node',str(HERE/'server.mjs'),'--port',str(port)]+(['--offline'] if offline else [])
    child=subprocess.Popen(cmd,cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace',bufsize=1)
    messages=queue.Queue(); marker=f'MYWAY_MANAGED_READY {port}'
    def read():
        with child.stdout:
            for line in child.stdout:
                line=line.rstrip().replace(key,'[private]')
                if line==marker: messages.put(True)
                else: print(line,flush=True)
        messages.put(False)
    threading.Thread(target=read,daemon=True).start()
    try:
        if not messages.get(timeout=20) or child.poll() is not None: raise RuntimeError('MyWay server failed to start.')
        return child
    except BaseException:
        stop_owned(child); raise

def start_embeddings(python):
    if listening(8001):
        print('Existing local embedding service detected; provider preflight will verify it.',flush=True);return None
    # Use original project Python, not the browser-only venv. Never install ML packages here.
    print('Starting local embedding service for real learning turns...',flush=True)
    try:
        child=subprocess.Popen([str(python),'-m','uvicorn','services.embeddings.app:app','--host','127.0.0.1','--port','8001'],cwd=ROOT,env={k:v for k,v in os.environ.items() if k.upper() not in {'OPENAI_API_KEY','MYWAY_OPENAI_API_KEY','MYWAY_MANAGED_PREVIEW_KEY'}})
        return child
    except OSError as e:
        print('Embedding startup unavailable; saved lessons still work. Real authorization will report preflight failure: '+str(e),flush=True);return None

def open_browser(port,key):
    # Driver failure is isolated from the server and recovered at most once.
    env=setup_env();env['MYWAY_MANAGED_PREVIEW_KEY']=key
    for attempt in range(2):
        cmd=[sys.executable,'-I',str(HERE/'isolated-browser.py'),'open','--port',str(port)]
        child=subprocess.Popen(cmd,cwd=ROOT,env=env)
        try: code=child.wait()
        except KeyboardInterrupt:
            stop_owned(child);raise
        if code==0: return
        if attempt==0: print('Browser controller stopped unexpectedly. Reopening once; no generation is replayed.',flush=True)
    raise RuntimeError('Matching Chromium browser controller failed twice. Saved journeys remain intact; inspect terminal output.')

def run(port,offline,project_python):
    key=secrets.token_hex(24);server=None;embedding=None
    try:
        server=start_lab(port,offline,sys.executable,key)
        if not offline: embedding=start_embeddings(project_python)
        print('Opening MyWay in its matching disposable Chromium browser. Close that browser or press Ctrl+C to exit.',flush=True)
        open_browser(port,key)
    finally:
        stop_owned(server);stop_owned(embedding)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8879);parser.add_argument('--offline',action='store_true');parser.add_argument('--managed-child',action='store_true',help=argparse.SUPPRESS);parser.add_argument('--project-python',help=argparse.SUPPRESS);a=parser.parse_args()
    if not 1024<=a.port<=65535: raise RuntimeError('Invalid port')
    check_root()
    if a.managed_child:
        setup_env()
        run(a.port,a.offline,a.project_python or sys.executable);return
    project_python=sys.executable;browser_python=ensure_python()
    if pathlib.Path(project_python).resolve()!=browser_python.resolve() or str(browser_python)!=project_python:
        cmd=[str(browser_python),'-I',str(HERE/'managed-lab.py'),'--managed-child','--project-python',project_python,'--port',str(a.port)]+(['--offline'] if a.offline else [])
        child=subprocess.Popen(cmd,cwd=ROOT)
        try: code=child.wait()
        except KeyboardInterrupt:
            # Both processes normally receive console Ctrl+C; give the managed child time to clean up.
            try: code=child.wait(timeout=15)
            except subprocess.TimeoutExpired: stop_owned(child);code=130
        if code: raise SystemExit(code)
    else: run(a.port,a.offline,project_python)

if __name__=='__main__':
    try: main()
    except KeyboardInterrupt: print('MyWay closed.',flush=True)
    except Exception as e: print('MyWay could not start: '+str(e),file=sys.stderr);sys.exit(1)
