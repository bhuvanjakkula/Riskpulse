import tempfile
import unittest
from pathlib import Path
from workspace import Workspace

class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'test.db';self.w=Workspace(self.path)
        self.a=self.w.apply({'action':'create_account','name':'Test','cash':10000,'limitPct':100})['account']
    def tearDown(self):self.tmp.cleanup()
    def order(self, **changes):
        d={'action':'order','accountId':self.a['id'],'requestId':'one','side':'buy','ticker':'TEST','quantity':10,'price':50,'fee':1,'sector':'Technology'};d.update(changes);return self.w.apply(d)['account']
    def test_buy_sell_fees_persist_and_deduplicate(self):
        a=self.order();self.assertEqual(a['cash'],949900);self.assertEqual(a['holdings']['TEST']['cost'],50100)
        self.assertEqual(len(self.order()['trades']),1)
        a=self.order(requestId='two',side='sell',quantity=5,price=60)
        self.assertEqual(a['cash'],979800);self.assertEqual(a['realized'],4850)
        a=self.order(requestId='three',side='sell',quantity=5,price=60)
        self.assertEqual(a['cash'],1009700);self.assertEqual(a['realized'],9700);self.assertEqual(a['holdings'],{})
        self.assertEqual(Workspace(self.path).snapshot()['accounts'][0]['cash'],1009700)
    def test_reject_and_rollback(self):
        for x in [{'quantity':0},{'quantity':True},{'price':float('nan')},{'price':0.001},{'side':'sell'},{'fee':11000},{'quantity':1000}]:
            with self.assertRaises(ValueError):self.order(**x)
        self.assertEqual(self.w.snapshot()['accounts'][0]['cash'],1000000)
        self.assertEqual(self.w.snapshot()['accounts'][0]['trades'],[])
    def test_order_limit(self):
        a=self.w.apply({'action':'create_account','name':'Limited','cash':10000,'limitPct':10})['account']
        with self.assertRaises(ValueError):self.order(accountId=a['id'],quantity=21)
    def test_portfolio_roundtrip(self):
        p={'ticker':'TEST','name':'Test','sector':'Other','shares':2,'price':50,'day':0,'beta':1,'side':1,'cp':'Unspecified','credit':'N/A','adv':None}
        self.w.apply({'action':'save_portfolio','name':'Saved','equity':10000,'positions':[p]})
        self.assertEqual(Workspace(self.path).snapshot()['portfolios'][0]['positions'],[p])
    def test_scenario_gates_and_pause(self):
        base={'enabled':True,'paused':False,'depth':10000,'duplicate':10,'withdrawal':10,'quoteAge':1,'maxAge':100,'cancelRate':10,'maxCancelRate':80,'inventoryLimit':10000,'shockPct':10,'lossBudget':1000}
        for change in [{'paused':True},{'quoteAge':200},{'depth':0},{'cancelRate':90},{'inventoryLimit':100},{'lossBudget':1}]:
            self.w.apply({'action':'set_guard','accountId':self.a['id'],'guard':{**base,**change}})
            with self.assertRaises(ValueError):self.order()
        self.assertEqual(len(self.w.snapshot()['accounts'][0]['trades']),0)
        self.w.apply({'action':'set_guard','accountId':self.a['id'],'guard':base})
        self.assertEqual(len(self.order()['trades']),1)
        self.assertEqual(len(Workspace(self.path).snapshot()['accounts'][0]['controlHistory']),7)
if __name__=='__main__':unittest.main()
