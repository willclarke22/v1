import argparse, os, pathlib, queue, socket, subprocess, sys, threading, webbrowser
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[3]
def listening(port):
    try:
        with socket.create_connection(('127.0.0.1',port),timeout=.3): return True
    except OSError: return False

def stop_owned(p):
    if p and p.poll() is None:
        p.terminate()
        try:p.wait(timeout=8)
        except subprocess.TimeoutExpired:p.kill();p.wait(timeout=5)

def run(port,offline):
    if listening(port):raise RuntimeError('Port already in use; stop previous Lab first.')
    env=dict(os.environ);env.pop('MYWAY_MANAGED_PREVIEW_KEY',None)
    runtime=ROOT/'.myway-patch-backups'/'r62b4-browser-runtime'
    py=runtime/'venv'/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
    if py.is_file():
        env['MYWAY_PYTHON']=str(py);env['PLAYWRIGHT_BROWSERS_PATH']=str(runtime/'browsers')
    else:env['MYWAY_PYTHON']=sys.executable
    server=None;embedding=None
    try:
        server=subprocess.Popen(['node',str(HERE/'server.mjs'),'--port',str(port)]+(['--offline'] if offline else []),cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace')
        q=queue.Queue()
        def read():
            for line in server.stdout:
                line=line.rstrip();print(line,flush=True)
                if line==f'MYWAY_NORMAL_READY {port}':q.put(True)
            q.put(False)
        threading.Thread(target=read,daemon=True).start()
        if not q.get(timeout=20) or server.poll() is not None:raise RuntimeError('Server startup failed')
        if not offline and not listening(8001):
            try:embedding=subprocess.Popen([sys.executable,'-m','uvicorn','services.embeddings.app:app','--host','127.0.0.1','--port','8001'],cwd=ROOT,env={k:v for k,v in os.environ.items() if k.upper() not in {'OPENAI_API_KEY','MYWAY_OPENAI_API_KEY'}})
            except OSError as e:print('Embedding service unavailable; authorization will check it: '+str(e),flush=True)
        url=f'http://127.0.0.1:{port}/';print('Open '+url+' in your normal browser. Ctrl+C stops the Lab.',flush=True)
        try:webbrowser.open(url)
        except Exception:print('Open the displayed URL manually.',flush=True)
        code=server.wait()
        if code:raise RuntimeError('Server stopped with code '+str(code))
    finally:stop_owned(server);stop_owned(embedding)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8879);p.add_argument('--offline',action='store_true');a=p.parse_args()
    if not 1024<=a.port<=65535:raise SystemExit('Invalid port')
    try:run(a.port,a.offline)
    except KeyboardInterrupt:print('MyWay stopped.',flush=True)
    except Exception as e:print('MyWay: '+str(e),file=sys.stderr);sys.exit(1)
