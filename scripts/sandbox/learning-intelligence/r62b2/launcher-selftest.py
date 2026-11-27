import importlib.util, pathlib, socket, sys, urllib.request, json, unittest
from unittest.mock import patch, MagicMock
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('managed',HERE/'managed-lab.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
    def test_actual_supervisor(self):
        with socket.socket() as s: s.bind(('127.0.0.1',0));port=s.getsockname()[1]
        key='a'*48; child=m.start_lab(port,True,sys.executable,key)
        try:
            req=urllib.request.Request(f'http://127.0.0.1:{port}/');body=urllib.request.urlopen(req,timeout=5).read().decode();self.assertIn('R6.2B.2',body);self.assertNotIn(key,body)
            with self.assertRaisesRegex(RuntimeError,'already in use'): m.start_lab(port,True,sys.executable,key)
        finally: m.stop_owned(child)
        self.assertIsNotNone(child.poll())
    def test_cleanup_if_browser_fails(self):
        server=MagicMock();embed=MagicMock()
        with patch.object(m,'start_lab',return_value=server),patch.object(m,'start_embeddings',return_value=embed),patch.object(m,'open_browser',side_effect=RuntimeError('browser failure')),patch.object(m,'stop_owned') as stop:
            with self.assertRaisesRegex(RuntimeError,'browser failure'): m.run(8879,False,sys.executable)
            self.assertEqual([c.args[0] for c in stop.call_args_list],[server,embed])
    def test_existing_embedding_not_owned(self):
        with patch.object(m,'listening',return_value=True),patch.object(m.subprocess,'Popen') as pop:
            self.assertIsNone(m.start_embeddings(sys.executable));pop.assert_not_called()
if __name__=='__main__': unittest.main()
