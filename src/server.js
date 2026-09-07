require("dotenv").config();
const express = require("express");
const path = require("node:path");
const { createStore } = require("./store");
const { researchOpportunity } = require("./research");
const { createAgencyPlan } = require("./agency");
const { createProductStore } = require("./product-store");
const { createProductRouter } = require("./product");
const { createValidationStore } = require("./validation-store");

const app = express();
const port = Number(process.env.PORT || 3000);
const store = createStore();
const productStore = createProductStore();
const validationStore = createValidationStore();
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
app.get("/api/opportunities", async (_req, res, next) => {
  try { res.json(await store.all()); } catch (error) { next(error); }
});
app.get("/product", (_req, res) => res.sendFile(path.join(process.cwd(), "public", "product.html")));
app.get("/validate", (_req, res) => res.sendFile(path.join(process.cwd(), "public", "validate.html")));
app.get("/privacy", (_req, res) => {
  const escape=(value)=>String(value||"").replace(/[&<>\"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;"}[char]));
  const business=escape(process.env.PUBLIC_BUSINESS_NAME||"SLA Flow pilot operator");
  const email=escape(process.env.PUBLIC_CONTACT_EMAIL||"Not configured");
  res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SLA Flow Pilot Privacy Notice</title><link rel="stylesheet" href="/validate.css"></head><body><main><nav><strong>SLA Flow</strong><a href="/validate">Back</a></nav><section class="hero"><span class="eyebrow">PILOT PRIVACY NOTICE · VERSION 1</span><h1>We collect only what the pilot needs.</h1><p>${business} stores your email, optional business name, team size, signup time and consent record to evaluate demand and contact you about this pilot. We do not sell this information or use it for unrelated advertising.</p><p>To withdraw or request access or deletion, email <a href="mailto:${email}">${email}</a>. Pilot records are reviewed after 90 days and removed when no longer needed.</p></section></main></body></html>`);
});
app.use("/api/product", createProductRouter(productStore, authorize));
const signupAttempts = new Map();
app.get("/api/validation/status", async (_req, res, next) => {
  try { const rows=await store.all(); const project=rows.find(row=>row.releaseGate?.id==="external-validation"); const approved=process.env.VALIDATION_ENABLED==="true"||project?.status==="validation_approved"; const identityReady=Boolean(process.env.PUBLIC_BUSINESS_NAME&&process.env.PUBLIC_CONTACT_EMAIL); res.json({open:approved&&identityReady,approved,identityReady,product:project?.agencyPlan?.productName||"SLA Flow"}); } catch(error){next(error);}
});
app.post("/api/validation/signup", async (req,res,next) => {
  try {
    const rows=await store.all(); const project=rows.find(row=>row.status==="validation_approved"); const approved=process.env.VALIDATION_ENABLED==="true"||Boolean(project);
    if(!approved||!process.env.PUBLIC_BUSINESS_NAME||!process.env.PUBLIC_CONTACT_EMAIL) return res.status(403).json({error:"Pilot signup is not open"});
    if(req.body.website) return res.status(202).json({ok:true});
    const key=req.ip; const recent=(signupAttempts.get(key)||[]).filter(time=>Date.now()-time<3600000);
    if(recent.length>=5) return res.status(429).json({error:"Too many signup attempts; try later"});
    recent.push(Date.now());signupAttempts.set(key,recent);
    const email=String(req.body.email||"").trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"Enter a valid email"});
    if(req.body.consent!==true) return res.status(400).json({error:"Consent is required"});
    await validationStore.create({email,businessName:String(req.body.businessName||"").trim().slice(0,120),teamSize:String(req.body.teamSize||"").trim().slice(0,40),source:"validation-page",consent:{given:true,textVersion:"pilot-v1",at:new Date().toISOString()}});
    res.status(201).json({ok:true,message:"You are on the pilot list."});
  }catch(error){next(error);}
});
app.get("/api/validation/signups",authorize,async(_req,res,next)=>{try{res.json(await validationStore.all());}catch(error){next(error);}});

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
  await productStore.init();
  await validationStore.init();
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
