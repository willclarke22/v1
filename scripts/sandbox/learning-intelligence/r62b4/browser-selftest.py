import importlib.util, pathlib, sys, unittest, socket, urllib.request, os
from unittest.mock import patch, MagicMock
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('managed',HERE/'managed-lab.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
    def test_private_runtime(self):
        self.assertEqual(m.PLAYWRIGHT_VERSION,'1.65.2')
        with patch.dict(os.environ,{'OPENAI_API_KEY':'secret','PYTHONPATH':'untrusted'},clear=False):
            env=m.setup_env(); self.assertNotIn('OPENAI_API_KEY',env); self.assertNotIn('PYTHONPATH',env); self.assertIn('r62b4-browser-runtime',env['PLAYWRIGHT_BROWSERS_PATH'])
        s=(HERE/'isolated-browser.py').read_text();self.assertNotIn("kwargs['channel']='msedge'",s);self.assertIn("kwargs['channel']='chromium'",s);self.assertIn('chromium_sandbox=True',s);self.assertIn("context.route_web_socket",s);self.assertIn("req.frame.parent_frame",s)
    def test_controller_restart_only_once(self):
        first=MagicMock();first.wait.return_value=1;second=MagicMock();second.wait.return_value=0
        with patch.object(m.subprocess,'Popen',side_effect=[first,second]) as pop:
            m.open_browser(8879,'a'*48);self.assertEqual(pop.call_count,2);self.assertNotIn('a'*48,pop.call_args.args[0]);self.assertEqual(pop.call_args.kwargs['env']['MYWAY_MANAGED_PREVIEW_KEY'],'a'*48)
        with patch.object(m.subprocess,'Popen',return_value=first) as pop:
            with self.assertRaisesRegex(RuntimeError,'failed twice'):m.open_browser(8879,'a'*48)
            self.assertEqual(pop.call_count,2)
        with patch.object(m.subprocess,'Popen',return_value=second) as pop:
            m.open_browser(8879,'a'*48);self.assertEqual(pop.call_count,1)
    def test_server_reuses_B3(self):
        with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
        key='a'*48;child=m.start_lab(port,True,sys.executable,key)
        try:
            body=urllib.request.urlopen(f'http://127.0.0.1:{port}/',timeout=5).read().decode();self.assertIn('R6.2B.3',body);self.assertNotIn(key,body)
            with self.assertRaisesRegex(RuntimeError,'already in use'):m.start_lab(port,True,sys.executable,key)
        finally:m.stop_owned(child)
if __name__=='__main__': unittest.main()
