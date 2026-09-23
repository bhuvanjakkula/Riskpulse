"""Durable, local-only portfolio and paper execution workspace."""
import json
import math
import re
import sqlite3
from pathlib import Path
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone
from uuid import uuid4
from contextlib import contextmanager

def now():
    return datetime.now(timezone.utc).isoformat()

def cents(value, positive=False):
    try:
        n = Decimal(str(value)) * 100
        if not n.is_finite() or n != n.to_integral_value() or n < 0 or n > 10**12 or (positive and n == 0):
            raise ValueError('Money must be nonnegative, at most 10 billion USD, with at most two decimal places.')
        return int(n)
    except InvalidOperation:
        raise ValueError('Invalid monetary amount.') from None

def label(value, name='Name'):
    if not isinstance(value,str) or not value.strip() or len(value)>100:
        raise ValueError(name+' must contain 1 to 100 characters.')
    return value.strip()

class Workspace:
    def __init__(self, path=None):
        self.path=Path(path or Path(__file__).parent/'data'/'workspace.sqlite3')
        self.path.parent.mkdir(parents=True,exist_ok=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, body TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS portfolios (id TEXT PRIMARY KEY, body TEXT NOT NULL)')
    @contextmanager
    def connect(self):
        db=sqlite3.connect(self.path,timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()
    def snapshot(self):
        with self.connect() as db:
            return {k:[json.loads(r[0]) for r in db.execute('SELECT body FROM '+k+' ORDER BY rowid DESC')] for k in ('accounts','portfolios')}
    def apply(self, data):
        action=data.get('action')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if action=='create_account':
                limit=data.get('limitPct',10)
                if type(limit) not in (int,float) or not math.isfinite(limit) or not 1<=limit<=100:
                    raise ValueError('Order limit must be between 1 and 100 percent.')
                cash=cents(data.get('cash'),True)
                a={'id':str(uuid4()),'name':label(data.get('name')),'initialCash':cash,'cash':cash,'limitPct':limit,'holdings':{},'trades':[],'createdAt':now(),'realized':0,'fees':0}
                db.execute('INSERT INTO accounts VALUES (?,?)',(a['id'],json.dumps(a)))
                return {'account':a,'message':'Paper account created.'}
            if action=='order':
                row=db.execute('SELECT body FROM accounts WHERE id=?',(data.get('accountId'),)).fetchone()
                if not row:raise ValueError('Select an existing paper account.')
                a=json.loads(row[0]); key=label(data.get('requestId'),'Request ID')
                if any(t['requestId']==key for t in a['trades']):
                    return {'account':a,'message':'This paper order was already recorded; it was not repeated.'}
                ticker=data.get('ticker','').strip().upper()
                if not re.fullmatch(r'[A-Z0-9][A-Z0-9.\-]{0,19}',ticker):raise ValueError('Use a ticker of 1 to 20 letters, digits, dots or hyphens.')
                qty=data.get('quantity');side=data.get('side')
                if type(qty) is not int or not 1<=qty<=100000000:raise ValueError('Quantity must be a positive whole number, at most 100 million.')
                if side not in ('buy','sell'):raise ValueError('Choose buy or sell.')
                price=cents(data.get('price'),True);fee=cents(data.get('fee',0));notional=price*qty
                if notional>10**12:raise ValueError('Order notional exceeds the supported amount.')
                guard=a.get('guard')
                if guard:
                    if guard['paused']:raise ValueError('Paper execution is paused for this account. Review the scenario controls before resuming.')
                    if guard['enabled']:
                        if guard['quoteAge']>guard['maxAge']:raise ValueError('Risk gate: assumed quote age exceeds the configured limit.')
                        depth=guard['depth']*(1-guard['duplicate']/100)*(1-guard['withdrawal']/100)
                        if notional/100>depth:raise ValueError('Risk gate: order exceeds assumed stressed executable depth.')
                        if guard['cancelRate']>guard['maxCancelRate']:raise ValueError('Risk gate: assumed cancellation rate exceeds its limit.')
                        if side=='buy':
                            exposure=sum(x['quantity']*x['mark'] for x in a['holdings'].values())+notional
                            if exposure/100>guard['inventoryLimit']:raise ValueError('Risk gate: account inventory limit would be exceeded.')
                            loss=exposure/100*guard['shockPct']/100
                            if loss>guard['lossBudget']:raise ValueError('Risk gate: correlated price-shock loss exceeds the scenario budget.')
                h=a['holdings'].get(ticker,{'quantity':0,'cost':0,'mark':price,'sector':label(data.get('sector','Unclassified'))})
                equity=a['cash']+sum(x['quantity']*x['mark'] for x in a['holdings'].values())
                if notional>equity*a['limitPct']/100:raise ValueError('Order exceeds the configured percentage of marked account equity. Reduce its size.')
                if side=='buy':
                    if notional+fee>a['cash']:raise ValueError('Insufficient paper cash including fees.')
                    a['cash']-=notional+fee;h['cost']+=notional+fee;h['quantity']+=qty
                else:
                    if qty>h['quantity']:raise ValueError('Insufficient holdings. Short selling is not supported.')
                    if a['cash']+notional-fee<0:raise ValueError('Insufficient cash to pay the fee.')
                    removed=h['cost'] if qty==h['quantity'] else int(Decimal(h['cost'])*qty/h['quantity'])
                    a['realized']+=notional-fee-removed;a['cash']+=notional-fee;h['cost']-=removed;h['quantity']-=qty
                h['mark']=price;h['asOf']=now();a['fees']+=fee
                if h['quantity']:a['holdings'][ticker]=h
                else:a['holdings'].pop(ticker,None)
                a['trades'].append({'id':str(uuid4()),'requestId':key,'at':now(),'ticker':ticker,'side':side,'quantity':qty,'price':price,'fee':fee,'notional':notional,'priceBasis':'User-entered assumed fill, not live execution'})
                db.execute('UPDATE accounts SET body=? WHERE id=?',(json.dumps(a),a['id']))
                return {'account':a,'message':'Paper '+side+' recorded. Cash and holdings updated.'}
            if action=='set_guard':
                row=db.execute('SELECT body FROM accounts WHERE id=?',(data.get('accountId'),)).fetchone()
                if not row:raise ValueError('Select an existing paper account.')
                g=data.get('guard')
                if not isinstance(g,dict) or type(g.get('enabled')) is not bool or type(g.get('paused')) is not bool:raise ValueError('Invalid scenario controls.')
                limits={'depth':(0,1e10),'duplicate':(0,100),'withdrawal':(0,100),'quoteAge':(0,1e9),'maxAge':(1,1e9),'cancelRate':(0,100),'maxCancelRate':(0,100),'inventoryLimit':(0,1e10),'shockPct':(0,100),'lossBudget':(0,1e10)}
                for k,(lo,hi) in limits.items():
                    if type(g.get(k)) not in (int,float) or not math.isfinite(g[k]) or not lo<=g[k]<=hi:raise ValueError('Invalid scenario input: '+k)
                a=json.loads(row[0]);a['guard']={k:g[k] for k in [*limits,'enabled','paused']};a['guard']['updatedAt']=now()
                a.setdefault('controlHistory',[]).append(dict(a['guard']))
                db.execute('UPDATE accounts SET body=? WHERE id=?',(json.dumps(a),a['id']))
                return {'account':a,'message':'Scenario controls saved. They will be checked before each new paper fill.'}
            if action=='save_portfolio':
                ps=data.get('positions');equity=data.get('equity')
                if not isinstance(ps,list) or not 1<=len(ps)<=5000:raise ValueError('Import or load between 1 and 5,000 positions first.')
                if type(equity) not in (int,float) or not math.isfinite(equity) or not 0<equity<=10**12:raise ValueError('Invalid portfolio equity.')
                for p in ps:
                    if not isinstance(p,dict):raise ValueError('Invalid position.')
                    for key in ('ticker','sector','name','cp','credit'):label(p.get(key),key)
                    for key in ('shares','price','day','beta'):
                        if type(p.get(key)) not in (int,float) or not math.isfinite(p[key]) or abs(p[key])>10**12:raise ValueError('Invalid position '+key)
                    if p['shares']<=0 or p['price']<=0 or p['day']<=-100 or p.get('side') not in (-1,1):raise ValueError('Invalid position values.')
                    if p.get('adv') is not None and (type(p['adv']) not in (int,float) or not math.isfinite(p['adv']) or p['adv']<=0):raise ValueError('Invalid ADV.')
                saved={'id':str(uuid4()),'name':label(data.get('name')),'equity':equity,'positions':ps,'source':label(data.get('source','Saved portfolio')),'savedAt':now()}
                body=json.dumps(saved,allow_nan=False)
                if len(body)>2*1024*1024:raise ValueError('Portfolio exceeds 2 MB.')
                db.execute('INSERT INTO portfolios VALUES (?,?)',(saved['id'],body))
                return {'message':'Portfolio saved on this computer.','portfolio':saved}
            raise ValueError('Unknown workspace action.')
