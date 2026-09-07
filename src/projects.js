const fs = require('node:fs/promises');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../projects');
function projectSlug(name) {
  const slug = String(name || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
  if (!slug || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(slug)) throw new Error('Invalid project name');
  return slug;
}
async function ensureProject(name, opportunityId, root = ROOT) {
  const slug = projectSlug(name);
  await fs.mkdir(root, {recursive:true});
  const realRoot = await fs.realpath(root);
  const directory = path.join(realRoot, slug);
  await fs.mkdir(directory, {recursive:true});
  if (await fs.realpath(directory) !== directory) throw new Error('Project directory must not be a symbolic link');
  const file = path.join(directory, 'project.json');
  const manifest = {name, slug, opportunityId, directory:`projects/${slug}`};
  try { await fs.writeFile(file, JSON.stringify(manifest,null,2)+'\n', {flag:'wx'}); }
  catch(error) {
    if(error.code !== 'EEXIST') throw error;
    const existing = JSON.parse(await fs.readFile(file,'utf8'));
    if(existing.opportunityId !== opportunityId) throw new Error('Project name already belongs to another opportunity');
    return existing;
  }
  return manifest;
}
async function listProjects() {
  await fs.mkdir(ROOT,{recursive:true});
  const entries = await fs.readdir(ROOT,{withFileTypes:true});
  const result=[];
  for(const entry of entries.filter(e=>e.isDirectory())) {
    try {result.push(JSON.parse(await fs.readFile(path.join(ROOT,entry.name,'project.json'),'utf8')));}
    catch(error){if(error.code !== 'ENOENT')throw error;}
  }
  return result;
}
module.exports={projectSlug,ensureProject,listProjects};
