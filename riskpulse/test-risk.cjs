const assert=require('node:assert/strict');
const {test}=require('node:test');
const R=require('./dist/risk.js');
const holding={ticker:'X',shares:100,price:110,side:1,day:10,beta:0,adv:1000,sector:'Technology'};
test('day P&L uses previous price, and reverses for shorts',()=>{
 assert.equal(R.summary([holding],10000).day,1000);
 assert.equal(R.summary([{...holding,side:-1}],10000).day,-1000);
});
test('hedged books retain gross exposure and sector concentration',()=>{
 const pair=[holding,{...holding,side:-1}];assert.ok(Math.abs(R.summary(pair,10000).gross-220)<1e-10);assert.equal(R.summary(pair,10000).net,0);assert.equal(R.totals(pair,'sector').Technology,22000);
});
test('zero beta, direct sector moves and short gains',()=>{
 assert.ok(R.stress([holding],'all',-.1)[0].x===0);
 assert.equal(R.stress([holding],'Technology',-.1)[0].x,-1100);
 assert.equal(R.stress([{...holding,side:-1}],'Technology',-.1)[0].x,1100);
});
test('CSV supports quotes, BOM, CRLF, zero beta and missing ADV',()=>{
 const p=R.parseCSV('\uFEFFticker,shares,price,sector,name,beta\r\nX,100,110,Technology,"Example, Inc.",0\r\n')[0];assert.equal(p.name,'Example, Inc.');assert.equal(p.beta,0);assert.equal(p.adv,null);assert.equal(R.exitDays(p),null);
});
test('CSV rejects incomplete, invalid or nonfinite holdings',()=>{
 for(const text of ['ticker,shares,price,sector\n','ticker,shares,price,sector\nX,NaN,4,Tech','ticker,shares,price,sector\nX,1,-4,Tech','ticker,shares,price,sector,day\nX,1,4,Tech,-100','ticker,shares,price,sector,side\nX,1,4,Tech,wrong','ticker,shares,price,sector\nX,1,4','ticker,shares,price,sector\n"X,1,4,Tech'])assert.throws(()=>R.parseCSV(text));
});
test('liquidity reflects normal volume and missing data',()=>{assert.equal(R.exitDays(holding),1);assert.equal(R.exitDays({...holding,adv:null}),null);assert.equal(R.exitDays({...holding,shares:1000}),10)});
test('non-USD imports require explicit conversion and preserve native price',()=>{
 assert.throws(()=>R.parseCSV('ticker,shares,price,sector,currency\nX,10,100,Energy,EUR'));
 const p=R.parseCSV('ticker,shares,price,sector,currency,fx_to_usd,asof\nX,10,100,Energy,EUR,1.2,2026-01-01')[0];
 assert.equal(p.nativePrice,100);assert.equal(p.price,120);assert.equal(R.value(p),1200);assert.equal(p.asOf,'2026-01-01');
});
