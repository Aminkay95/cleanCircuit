const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {ensureProject,projectSlug}=require('../src/projects');
test('project workspaces are contained, idempotent and collision protected',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'agency-projects-'));
 const p=await ensureProject('Clean Circuit','one',root);
 assert.equal(p.directory,'projects/clean-circuit');
 assert.deepEqual(await ensureProject('Clean Circuit','one',root),p);
 await assert.rejects(ensureProject('Clean Circuit','two',root),/already belongs/);
 assert.equal(projectSlug('../../outside'),'outside');
 assert.throws(()=>projectSlug('..'),/Invalid/);
});
