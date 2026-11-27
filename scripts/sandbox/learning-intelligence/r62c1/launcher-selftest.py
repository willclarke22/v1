import importlib.util, pathlib, unittest, io, contextlib, webbrowser
from unittest.mock import patch, MagicMock
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('manual_launch',HERE/'launch.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
    def test_no_browser_launch_and_offline_flag(self):
        server=MagicMock();server.stdout=iter(['MYWAY_NORMAL_READY 8879\n']);server.poll.side_effect=[None,0];server.wait.return_value=0
        buf=io.StringIO()
        with patch.object(m,'listening',return_value=False),patch.object(m.subprocess,'Popen',return_value=server) as pop,patch.object(webbrowser,'open') as browser,contextlib.redirect_stdout(buf):
            m.run(8879,True);browser.assert_not_called();self.assertEqual(pop.call_count,1);self.assertIn('--offline',pop.call_args.args[0]);self.assertIn('http://127.0.0.1:8879/',buf.getvalue())
    def test_real_start_no_browser(self):
        server=MagicMock();server.stdout=iter(['MYWAY_NORMAL_READY 8879\n']);server.poll.side_effect=[None,0];server.wait.return_value=0
        with patch.object(m,'listening',side_effect=[False,True]),patch.object(m.subprocess,'Popen',return_value=server) as pop,patch.object(webbrowser,'open') as browser,contextlib.redirect_stdout(io.StringIO()):
            m.run(8879,False);browser.assert_not_called();self.assertEqual(pop.call_count,1);self.assertNotIn('--offline',pop.call_args.args[0])
if __name__=='__main__':unittest.main()
