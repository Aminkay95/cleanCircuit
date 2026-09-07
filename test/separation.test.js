const test=require('node:test');
const assert=require('node:assert/strict');
test('agency and product expose separate routes',async()=>{
 const agency=require('../src/server').app;
 const product=require('../projects/cleancircuit/src/server').app;
 const a=agency.listen(0);const p=product.listen(0);
 try {
  const agencyUrl=`http://localhost:${a.address().port}`;
  const productUrl=`http://localhost:${p.address().port}`;
  assert.equal((await fetch(agencyUrl+'/product')).status,404);
  assert.equal((await fetch(agencyUrl+'/api/product/jobs')).status,404);
  assert.equal((await fetch(productUrl+'/api/research/run',{method:'POST'})).status,404);
  assert.equal((await fetch(productUrl+'/api/opportunities')).status,404);
  assert.match(await (await fetch(productUrl+'/')).text(),/CleanCircuit/);
  assert.equal((await fetch(productUrl+'/api/product/jobs')).status,401);
  assert.equal((await fetch(agencyUrl+'/api/projects')).status,401);
 } finally {await Promise.all([new Promise(r=>a.close(r)),new Promise(r=>p.close(r))]);}
});
