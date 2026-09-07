const path=require('node:path');
const root=path.resolve(__dirname,'..');
require('dotenv').config({path:path.join(root,'.env')});
const express=require('express');
const {createProductStore}=require('./product-store');
const {createProductRouter}=require('./product');
const {createValidationStore}=require('./validation-store');
const app=express();
const productStore=createProductStore();
const validationStore=createValidationStore();
app.use(express.json({limit:'100kb'}));
app.get('/',(_req,res)=>res.sendFile(path.join(root,'public/validate.html')));
app.use(express.static(path.join(root,'public')));
function authorize(req, res, next) {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured) return res.status(503).json({ error: "ADMIN_TOKEN is not configured" });
  if (req.get("authorization") !== `Bearer ${configured}`) return res.status(401).json({ error: "Unauthorized" });
  next();
}


app.get('/health',(_req,res)=>res.json({ok:true,service:'cleancircuit'}));
app.get('/api/auth/check',authorize,(_req,res)=>res.json({ok:true}));
app.get("/product", (_req, res) => res.sendFile(path.join(root, "public", "product.html")));
app.get("/validate", (_req, res) => res.sendFile(path.join(root, "public", "validate.html")));
app.get("/privacy", (_req, res) => {
  const escape=(value)=>String(value||"").replace(/[&<>\"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;"}[char]));
  const product=escape(process.env.PRODUCT_NAME||"CleanCircuit");
  const business=escape(process.env.PUBLIC_BUSINESS_NAME||"Raducon Holdings");
  const email=escape(process.env.PUBLIC_CONTACT_EMAIL||"Not configured");
  res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${product} Pilot Privacy Notice</title><link rel="stylesheet" href="/validate.css"></head><body><main><nav><strong>${product}</strong><a href="/validate">Back</a></nav><section class="hero"><span class="eyebrow">PILOT PRIVACY NOTICE · VERSION 1</span><h1>We collect only what the pilot needs.</h1><p>${business} stores your email, optional business name, team size, signup time and consent record to evaluate demand and contact you about this pilot. We do not sell this information or use it for unrelated advertising.</p><p>To withdraw or request access or deletion, email <a href="mailto:${email}">${email}</a>. Pilot records are reviewed after 90 days and removed when no longer needed.</p></section></main></body></html>`);
});
app.use("/api/product", createProductRouter(productStore, authorize));
const signupAttempts = new Map();
app.get("/api/validation/status", async (_req, res, next) => {
  try { const approved=process.env.VALIDATION_ENABLED==="true"; const identityReady=Boolean(process.env.PUBLIC_BUSINESS_NAME&&process.env.PUBLIC_CONTACT_EMAIL); res.json({open:approved&&identityReady,approved,identityReady,product:process.env.PRODUCT_NAME||"CleanCircuit"}); } catch(error){next(error);}
});
app.post("/api/validation/signup", async (req,res,next) => {
  try {
    const approved=process.env.VALIDATION_ENABLED==="true";
    if(!approved||!process.env.PUBLIC_BUSINESS_NAME||!process.env.PUBLIC_CONTACT_EMAIL) return res.status(403).json({error:"Pilot signup is not open"});
    if(req.body.website) return res.status(202).json({ok:true});
    const key=req.ip; const recent=(signupAttempts.get(key)||[]).filter(time=>Date.now()-time<3600000);
    if(recent.length>=5) return res.status(429).json({error:"Too many signup attempts; try later"});
    recent.push(Date.now());signupAttempts.set(key,recent);
    const email=String(req.body.email||"").trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"Enter a valid email"});
    if(req.body.consent!==true) return res.status(400).json({error:"Consent is required"});
    await validationStore.create({recordType:"signup",email,businessName:String(req.body.businessName||"").trim().slice(0,120),teamSize:String(req.body.teamSize||"").trim().slice(0,40),market:String(req.body.market||process.env.PRIMARY_MARKET||"United States").trim().slice(0,80),source:"validation-page",consent:{given:true,textVersion:"pilot-v1",at:new Date().toISOString()}});
    res.status(201).json({ok:true,message:"You are on the pilot list."});
  }catch(error){next(error);}
});
app.get("/api/validation/signups",authorize,async(_req,res,next)=>{try{res.json(await validationStore.all());}catch(error){next(error);}});
app.post("/api/validation/interviews",authorize,async(req,res,next)=>{try{
  const pain=Number(req.body.painScore);if(!Number.isInteger(pain)||pain<1||pain>10)return res.status(400).json({error:"painScore must be 1-10"});
  const record=await validationStore.create({recordType:"interview",businessName:String(req.body.businessName||"").trim().slice(0,120),market:String(req.body.market||"").trim().slice(0,80),painScore:pain,coreProblemConfirmed:req.body.coreProblemConfirmed===true,pilotAccepted:req.body.pilotAccepted===true,paidPilotAccepted:req.body.paidPilotAccepted===true,notes:String(req.body.notes||"").trim().slice(0,2000)});res.status(201).json(record);
}catch(error){next(error);}});
app.get("/api/validation/metrics",authorize,async(_req,res,next)=>{try{
  const records=await validationStore.all();const interviews=records.filter(row=>row.recordType==="interview");const signups=records.filter(row=>row.recordType==="signup"||!row.recordType);const metrics={signups:signups.length,interviews:interviews.length,problemConfirmed:interviews.filter(row=>row.coreProblemConfirmed).length,pilotAccepted:interviews.filter(row=>row.pilotAccepted).length,paidPilotAccepted:interviews.filter(row=>row.paidPilotAccepted).length,averagePain:interviews.length?Math.round(interviews.reduce((sum,row)=>sum+row.painScore,0)/interviews.length*10)/10:0};metrics.thresholds={interviews:10,problemConfirmed:6,pilotAccepted:3,paidPilotAccepted:2};metrics.passed=Object.entries(metrics.thresholds).every(([key,value])=>metrics[key]>=value);res.json(metrics);
}catch(error){next(error);}});


app.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.message||'Unexpected error'}));
async function start(){await productStore.init();await validationStore.init();return app.listen(Number(process.env.PORT||3001),()=>console.log('CleanCircuit listening on port '+(process.env.PORT||3001)));}
if(require.main===module)start().catch(error=>{console.error(error);process.exit(1);});
module.exports={app,start};
