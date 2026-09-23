import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize,csvRows,fetchSource} from './src/data-service.mjs';
test('OFR observations retain dated components and sort chronologically',()=>{
 const r=normalize('fsi','Date,OFR FSI,Credit\n2026-01-02,1.2,0.4\n2026-01-01,-0.3,-0.2');assert.equal(r.asOf,'2026-01-02');assert.equal(r.latest.Credit,.4);assert.equal(r.previous['OFR FSI'],-.3);
});
test('missing source observations are rejected, never coerced to zero',()=>{
 assert.throws(()=>normalize('fsi','Date,OFR FSI,Credit\n2026-01-01,1,\n2026-01-02,2,0'));
 assert.throws(()=>normalize('fx',"<Cube time='2026-01-02'><Cube currency='USD' rate='0'/></Cube>"));
});
test('ECB conversion preserves base currency and observation date',()=>{
 const r=normalize('fx',"<Cube time='2026-01-02'><Cube currency='USD' rate='1.2'/><Cube currency='INR' rate='100'/></Cube>");assert.equal(r.rates.EUR,1);assert.equal(r.rates.USD/r.rates.INR,.012);assert.equal(r.asOf,'2026-01-02');
});
test('global MIC registry supports quoted institution names',()=>{
 const r=normalize('venues','MIC,OPERATING MIC,STATUS,MARKET NAME-INSTITUTION DESCRIPTION\nABCD,ABCD,ACTIVE,"Exchange, Limited"');assert.equal(r.venues[0].name,'Exchange, Limited');assert.equal(r.venues[0].mic,'ABCD');
});
test('SOFR normalization uses effective date rather than retrieval date',()=>{
 const row=(date,rate)=>({type:'SOFR',effectiveDate:date,percentRate:rate,volumeInBillions:2500,percentPercentile1:3,percentPercentile99:4});const r=normalize('sofr',JSON.stringify({refRates:[row('2026-01-02',3.6),row('2026-01-01',3.5)]}));assert.equal(r.latest.rate,3.6);assert.equal(r.asOf,'2026-01-02');
});
test('HTTP failures reject without synthetic fallback',async()=>{await assert.rejects(fetchSource('venues',async()=>new Response('Forbidden',{status:403})),/403/)});
test('unclosed CSV quotes fail validation',()=>assert.throws(()=>csvRows('a,b\n"unfinished')));
