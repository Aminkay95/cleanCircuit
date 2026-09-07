const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { Pool } = require("pg");

class JsonValidationStore {
  constructor(file=path.join(process.cwd(),"data","pilot-signups.json")){this.file=file;this.queue=Promise.resolve();}
  async init(){await fs.mkdir(path.dirname(this.file),{recursive:true});try{await fs.access(this.file);}catch{await fs.writeFile(this.file,"[]\n");}}
  async all(){return JSON.parse(await fs.readFile(this.file,"utf8"));}
  async create(input){const lead={id:crypto.randomUUID(),createdAt:new Date().toISOString(),status:"new",...input};this.queue=this.queue.then(async()=>{const rows=await this.all();rows.unshift(lead);await fs.writeFile(this.file,`${JSON.stringify(rows,null,2)}\n`);});await this.queue;return lead;}
}

class PostgresValidationStore {
  constructor(connectionString){this.pool=new Pool({connectionString,ssl:connectionString.includes("localhost")?false:{rejectUnauthorized:false}});}
  async init(){await this.pool.query("CREATE TABLE IF NOT EXISTS pilot_signups (id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, payload JSONB NOT NULL)");}
  async all(){const {rows}=await this.pool.query("SELECT payload FROM pilot_signups ORDER BY created_at DESC");return rows.map(row=>row.payload);}
  async create(input){const lead={id:crypto.randomUUID(),createdAt:new Date().toISOString(),status:"new",...input};await this.pool.query("INSERT INTO pilot_signups(id,created_at,payload) VALUES($1,$2,$3)",[lead.id,lead.createdAt,lead]);return lead;}
}

function createValidationStore(){return process.env.DATABASE_URL?new PostgresValidationStore(process.env.DATABASE_URL):new JsonValidationStore();}
module.exports={createValidationStore,JsonValidationStore,PostgresValidationStore};
