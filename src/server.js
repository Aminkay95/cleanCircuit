require("dotenv").config();
const express = require("express");
const path = require("node:path");
const { createStore } = require("./store");
const { researchOpportunity } = require("./research");
const { createAgencyPlan } = require("./agency");
const { ensureProject, listProjects } = require("./projects");

const app = express();
const port = Number(process.env.PORT || 3000);
const store = createStore();
let activeRun = null;
const activePlans = new Map();

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(process.cwd(), "public")));

function authorize(req, res, next) {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured) return res.status(503).json({ error: "ADMIN_TOKEN is not configured" });
  if (req.get("authorization") !== `Bearer ${configured}`) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.get("/health", (_req, res) => res.json({ ok: true, activeRun: Boolean(activeRun) }));
app.get("/api/config", (_req, res) => res.json({
  niche: process.env.RESEARCH_NICHE || "B2C subscription apps for everyday consumers",
  model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
  analysisProvider: "groq",
  liveResearchConfigured: Boolean(process.env.GROQ_API_KEY && process.env.BRAVE_SEARCH_API_KEY),
  searchProvider: "brave",
  database: process.env.DATABASE_URL ? "postgres" : "local-json"
}));
app.get("/api/auth/check", authorize, (_req, res) => res.json({ ok: true }));
app.get('/api/projects', authorize, async (_req,res,next)=>{try{res.json(await listProjects());}catch(error){next(error);}});
app.get("/api/opportunities", async (_req, res, next) => {
  try { res.json(await store.all()); } catch (error) { next(error); }
});
async function runResearch(overrides = {}) {
  if (activeRun) return activeRun;
  activeRun = (async () => {
    const opportunity = await researchOpportunity({
      niche: overrides.niche || process.env.RESEARCH_NICHE || "B2C subscription apps for everyday consumers",
      maxProducts: Math.min(Number(overrides.maxProducts || process.env.MAX_PRODUCTS_PER_RUN || 5), 10)
    });
    await store.save(opportunity);
    return opportunity;
  })().finally(() => { activeRun = null; });
  return activeRun;
}

app.post("/api/research/run", authorize, async (req, res, next) => {
  try {
    if (activeRun) return res.status(409).json({ error: "A research run is already active" });
    res.status(201).json(await runResearch(req.body || {}));
  } catch (error) { next(error); }
});

app.post("/api/opportunities/:id/decision", authorize, async (req, res, next) => {
  try {
    if (!["approved", "rejected"].includes(req.body.status)) {
      return res.status(400).json({ error: "status must be approved or rejected" });
    }
    const updated = await store.setStatus(req.params.id, req.body.status, req.body.note);
    if (!updated) return res.status(404).json({ error: "Opportunity not found" });
    res.json(updated);
  } catch (error) { next(error); }
});

app.post("/api/opportunities/:id/plan", authorize, async (req, res, next) => {
  try {
    const current = await store.get(req.params.id);
    if (!current) return res.status(404).json({ error: "Opportunity not found" });
    if (!['approved', 'awaiting_build_approval'].includes(current.status)) {
      return res.status(409).json({ error: "Opportunity must be approved before planning" });
    }
    if (current.agencyPlan) return res.json(current);
    if (activePlans.has(current.id)) return res.status(409).json({ error: "Planning is already active" });
    const work = createAgencyPlan(current)
      .then((agencyPlan) => store.patch(current.id, { agencyPlan, status: "awaiting_build_approval" }))
      .finally(() => activePlans.delete(current.id));
    activePlans.set(current.id, work);
    res.status(201).json(await work);
  } catch (error) { next(error); }
});

app.post("/api/opportunities/:id/build-decision", authorize, async (req, res, next) => {
  try {
    const current = await store.get(req.params.id);
    if (!current) return res.status(404).json({ error: "Opportunity not found" });
    if (!current.agencyPlan || current.status !== "awaiting_build_approval") {
      return res.status(409).json({ error: "A completed agency plan is required" });
    }
    if (!["approved", "rejected"].includes(req.body.status)) {
      return res.status(400).json({ error: "status must be approved or rejected" });
    }
    const agencyPlan = {
      ...current.agencyPlan,
      gate: {
        ...current.agencyPlan.gate,
        status: req.body.status,
        decidedAt: new Date().toISOString(),
        note: req.body.note || ""
      }
    };
    const status = req.body.status === "approved" ? "build_approved" : "plan_rejected";
    if (status === 'build_approved') {
      agencyPlan.workspace = await ensureProject(agencyPlan.productName, current.id);
      agencyPlan.tasks = agencyPlan.tasks.map(task => ({...task, workingDirectory:agencyPlan.workspace.directory}));
    }
    res.json(await store.patch(current.id, { agencyPlan, status }));
  } catch (error) { next(error); }
});

app.post("/api/opportunities/:id/validation-decision", authorize, async (req, res, next) => {
  try {
    const current = await store.get(req.params.id);
    if (!current) return res.status(404).json({ error: "Opportunity not found" });
    if (!current.releaseGate || current.status !== "staging_ready") {
      return res.status(409).json({ error: "Private staging must pass QA first" });
    }
    if (!["approved", "rejected"].includes(req.body.status)) {
      return res.status(400).json({ error: "status must be approved or rejected" });
    }
    const releaseGate = { ...current.releaseGate, status: req.body.status, decidedAt: new Date().toISOString(), note: req.body.note || "" };
    const status = req.body.status === "approved" ? "validation_approved" : "validation_rejected";
    res.json(await store.patch(current.id, { releaseGate, status }));
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.code === "json_validate_failed") {
    return res.status(502).json({
      error: "Groq did not finish the structured report. The run was not saved; please retry in one minute."
    });
  }
  res.status(error.status || 500).json({ error: error.message || "Unexpected error" });
});

async function start() {
  await store.init();
  app.listen(port, () => console.log(`SaaS Scout listening on http://localhost:${port}`));

  const hours = Number(process.env.RESEARCH_INTERVAL_HOURS || 0);
  if (hours > 0) {
    const interval = hours * 60 * 60 * 1000;
    setInterval(() => runResearch().catch((error) => console.error("Scheduled research failed", error)), interval);
    console.log(`Scheduled research enabled every ${hours} hour(s)`);
  }
}

if (require.main === module) start().catch((error) => { console.error(error); process.exit(1); });

module.exports = { app, authorize };
