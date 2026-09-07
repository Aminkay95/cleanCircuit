const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { Pool } = require("pg");

class ProductStore {
  constructor(file = path.join(path.resolve(__dirname,".."), "data", "service-jobs.json")) {
    this.file = file;
    this.queue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    try { await fs.access(this.file); } catch { await fs.writeFile(this.file, "[]\n"); }
  }

  async all() {
    return JSON.parse(await fs.readFile(this.file, "utf8"));
  }

  async create(input) {
    const now = new Date().toISOString();
    const job = {
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      customer: { name: input.customerName, email: input.customerEmail, address: input.serviceAddress },
      service: { description: input.description, date: input.serviceDate, amountCents: input.amountCents, depositCents: input.depositCents },
      quote: { number: `Q-${Date.now().toString().slice(-7)}`, status: "draft" },
      contract: { status: "not_sent", provider: "sandbox" },
      schedule: { status: "unscheduled", startsAt: null },
      handoff: { status: "pending", subcontractor: null },
      deposit: { status: "not_requested", provider: "paystack_sandbox", checkoutUrl: null },
      timeline: [{ at: now, event: "job.created", detail: "Draft quote created" }]
    };
    return this.#mutate((rows) => [job, ...rows], job);
  }

  async transition(id, event, apply) {
    let updated;
    await this.#mutate((rows) => rows.map((job) => {
      if (job.id !== id) return job;
      const now = new Date().toISOString();
      updated = apply(structuredClone(job));
      updated.updatedAt = now;
      updated.timeline.unshift({ at: now, event, detail: event.replaceAll(".", " ") });
      return updated;
    }));
    return updated;
  }

  async #mutate(fn, returnValue) {
    this.queue = this.queue.then(async () => {
      const rows = JSON.parse(await fs.readFile(this.file, "utf8"));
      const next = fn(rows);
      await fs.writeFile(this.file, `${JSON.stringify(next, null, 2)}\n`);
      return returnValue || next;
    });
    return this.queue;
  }
}

class PostgresProductStore {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString, ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false } });
  }
  async init() { await this.pool.query("CREATE TABLE IF NOT EXISTS service_jobs (id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL, payload JSONB NOT NULL)"); }
  async all() { const { rows } = await this.pool.query("SELECT payload FROM service_jobs ORDER BY created_at DESC"); return rows.map((row) => row.payload); }
  async create(input) {
    const now = new Date().toISOString(); const id = crypto.randomUUID();
    const job = { id, createdAt:now, updatedAt:now, customer:{name:input.customerName,email:input.customerEmail,address:input.serviceAddress}, service:{description:input.description,date:input.serviceDate,amountCents:input.amountCents,depositCents:input.depositCents}, quote:{number:`Q-${Date.now().toString().slice(-7)}`,status:"draft"}, contract:{status:"not_sent",provider:"sandbox"}, schedule:{status:"unscheduled",startsAt:null}, handoff:{status:"pending",subcontractor:null}, deposit:{status:"not_requested",provider:"paystack_sandbox",checkoutUrl:null}, timeline:[{at:now,event:"job.created",detail:"Draft quote created"}] };
    await this.pool.query("INSERT INTO service_jobs(id, created_at, payload) VALUES($1,$2,$3)",[id,now,job]); return job;
  }
  async transition(id,event,apply) {
    const client=await this.pool.connect();
    try { await client.query("BEGIN"); const {rows}=await client.query("SELECT payload FROM service_jobs WHERE id=$1 FOR UPDATE",[id]); if(!rows[0]){await client.query("ROLLBACK");return undefined;} const now=new Date().toISOString(); const updated=apply(structuredClone(rows[0].payload)); updated.updatedAt=now; updated.timeline.unshift({at:now,event,detail:event.replaceAll("."," ")}); await client.query("UPDATE service_jobs SET payload=$2 WHERE id=$1",[id,updated]); await client.query("COMMIT"); return updated; } catch(error){await client.query("ROLLBACK");throw error;} finally{client.release();}
  }
}

function createProductStore() { return process.env.DATABASE_URL ? new PostgresProductStore(process.env.DATABASE_URL) : new ProductStore(); }

module.exports = { ProductStore, PostgresProductStore, createProductStore };
