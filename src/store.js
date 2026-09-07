const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");

class JsonStore {
  constructor(file = path.join(process.cwd(), "data", "opportunities.json")) {
    this.file = file;
    this.queue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    try { await fs.access(this.file); } catch { await fs.writeFile(this.file, "[]\n"); }
  }

  async all() {
    const rows = JSON.parse(await fs.readFile(this.file, "utf8"));
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async save(opportunity) {
    return this.#mutate((rows) => [opportunity, ...rows]);
  }

  async get(id) {
    return (await this.all()).find((row) => row.id === id);
  }

  async patch(id, changes) {
    let updated;
    await this.#mutate((rows) => rows.map((row) => {
      if (row.id !== id) return row;
      updated = { ...row, ...changes, updatedAt: new Date().toISOString() };
      return updated;
    }));
    return updated;
  }

  async setStatus(id, status, note) {
    let updated;
    await this.#mutate((rows) => rows.map((row) => {
      if (row.id !== id) return row;
      updated = { ...row, status, decisionNote: note || "", decidedAt: new Date().toISOString() };
      return updated;
    }));
    return updated;
  }

  async #mutate(fn) {
    this.queue = this.queue.then(async () => {
      const rows = JSON.parse(await fs.readFile(this.file, "utf8"));
      const next = fn(rows);
      await fs.writeFile(this.file, `${JSON.stringify(next, null, 2)}\n`);
      return next;
    });
    return this.queue;
  }
}

class PostgresStore {
  constructor(connectionString) {
    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false }
    });
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS opportunities (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL,
        payload JSONB NOT NULL
      )
    `);
  }

  async all() {
    const { rows } = await this.pool.query("SELECT payload FROM opportunities ORDER BY created_at DESC");
    return rows.map((row) => row.payload);
  }

  async save(opportunity) {
    await this.pool.query(
      "INSERT INTO opportunities(id, created_at, status, payload) VALUES($1, $2, $3, $4)",
      [opportunity.id, opportunity.createdAt, opportunity.status, opportunity]
    );
    return opportunity;
  }

  async get(id) {
    const { rows } = await this.pool.query("SELECT payload FROM opportunities WHERE id=$1", [id]);
    return rows[0]?.payload;
  }

  async patch(id, changes) {
    const current = await this.get(id);
    if (!current) return undefined;
    const updated = { ...current, ...changes, updatedAt: new Date().toISOString() };
    await this.pool.query("UPDATE opportunities SET status=$2, payload=$3 WHERE id=$1", [id, updated.status, updated]);
    return updated;
  }

  async setStatus(id, status, note) {
    const { rows } = await this.pool.query("SELECT payload FROM opportunities WHERE id=$1", [id]);
    if (!rows[0]) return undefined;
    const updated = {
      ...rows[0].payload,
      status,
      decisionNote: note || "",
      decidedAt: new Date().toISOString()
    };
    await this.pool.query("UPDATE opportunities SET status=$2, payload=$3 WHERE id=$1", [id, status, updated]);
    return updated;
  }
}

function createStore() {
  return process.env.DATABASE_URL
    ? new PostgresStore(process.env.DATABASE_URL)
    : new JsonStore();
}

module.exports = { createStore, JsonStore, PostgresStore };
