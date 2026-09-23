"""Windows-compatible replacement for the absent Linux command examples."""
import argparse
import json
import math
from datetime import datetime, timezone

RULES = ['Illustrative policy: risk 1% of equity per proposed long position.', 'Size is capped at unlevered equity; fees, gaps and slippage are excluded.', 'Hold for review when regime is unstable, relative strengths are nonpositive, or a tip is the sole rationale.', 'A stop price is not a guaranteed execution price. No order is sent.']
CHECKLIST = ['Verify price dates, currency and instrument identity.', 'Review total portfolio exposure, liquidity and funding.', 'Validate stop distance and realistic gap losses.', 'Obtain the required institutional review before execution.']

def size(equity, entry, stop, risk_pct=1):
    if not all(math.isfinite(v) for v in (equity, entry, stop, risk_pct)) or not (equity > 0 and entry > stop > 0 and 0 < risk_pct <= 100):
        raise ValueError('Require equity > 0, entry > stop > 0 and risk percent in (0,100].')
    units = math.floor(min(equity*risk_pct/100/(entry-stop), equity/entry))
    return {'shares': units, 'notional': units*entry, 'loss_at_stop_excluding_gaps': units*(entry-stop), 'risk_budget': equity*risk_pct/100}

def recover(loss_pct):
    if not math.isfinite(loss_pct) or not 0 <= loss_pct < 100:
        raise ValueError('Loss percent must be in [0,100); recovery from total loss is undefined.')
    return {'loss_pct': loss_pct, 'required_gain_pct': 100*loss_pct/(100-loss_pct)}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['rules','size','recover','decide','demo','snapshot','checklist'])
    for key,default in [('equity',100000),('entry',50),('stop',48),('risk-pct',1),('loss-pct',20),('stock-rs',0),('group-rs',0)]:
        p.add_argument('--'+key,type=float,default=default)
    p.add_argument('--regime',choices=['stable','unstable'],default='stable');p.add_argument('--tip',action='store_true')
    a=p.parse_args()
    try:
        if a.command=='rules': result=RULES
        elif a.command=='checklist': result=CHECKLIST
        elif a.command=='recover': result=recover(a.loss_pct)
        elif a.command=='size': result=size(a.equity,a.entry,a.stop,a.risk_pct)
        elif a.command=='decide':
            if not all(math.isfinite(v) for v in (a.stock_rs,a.group_rs)): raise ValueError('Relative strength must be finite.')
            reasons=[]
            if a.regime=='unstable': reasons.append('Unstable regime')
            if a.stock_rs<=0 or a.group_rs<=0: reasons.append('Nonpositive relative strength')
            if a.tip: reasons.append('Tip-based rationale requires independent validation')
            result={'decision':'HOLD FOR REVIEW' if reasons else 'ELIGIBLE FOR MANUAL REVIEW','reasons':reasons,'sizing':size(a.equity,a.entry,a.stop,a.risk_pct),'policy':'Illustrative rules, not an investment recommendation'}
        elif a.command=='demo': result={'inputType':'Illustrative','size':size(100000,50,48),'recovery':recover(20)}
        else: result={'at':datetime.now(timezone.utc).isoformat(),'rules':RULES,'checklist':CHECKLIST,'market_data':'Not connected; no live snapshot is claimed'}
        print(json.dumps(result,indent=2,allow_nan=False))
    except ValueError as e:p.error(str(e))

if __name__=='__main__': main()
