const {test}=require('node:test');const assert=require('node:assert/strict');const {evaluate}=require('./dist/controls.js');
const base={depth:1000000,duplicate:30,withdrawal:50,order:400000,inventory:600000,limit:900000,age:150,maxAge:100,cash:300000,margin:350000,outflows:50000};
test('joint liquidity, inventory, feed and funding breaches',()=>{const r=evaluate(base);assert.equal(r.effectiveDepth,350000);assert.equal(r.fundingGap,100000);assert.ok(r.checks.every(c=>c.breach));});
test('full withdrawal leaves no executable depth',()=>assert.equal(evaluate({...base,withdrawal:100}).effectiveDepth,0));
test('exact limits pass and invalid inputs fail',()=>{assert.ok(evaluate({...base,order:300000,age:100,cash:400000}).checks.every(c=>!c.breach));for(const x of [{duplicate:101},{limit:0},{cash:NaN},{depth:-1}])assert.throws(()=>evaluate({...base,...x}));});
