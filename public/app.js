const list = document.querySelector("#opportunities");
const template = document.querySelector("#card-template");
const tokenInput = document.querySelector("#token");
const nicheInput = document.querySelector("#niche");
const runButton = document.querySelector("#run");
const tokenStatus = document.querySelector("#token-status");
tokenInput.value = localStorage.getItem("adminToken") || "";

async function api(url, options = {}) {
  const headers = { "content-type": "application/json", ...(options.headers || {}) };
  if (tokenInput.value) headers.authorization = `Bearer ${tokenInput.value}`;
  const response = await fetch(url, { ...options, headers });
  const body = await response.json();
  if (response.status === 401) {
    localStorage.removeItem("adminToken");
    tokenInput.value = "";
    tokenStatus.textContent = "Token does not match the running server. Paste the current ADMIN_TOKEN from .env.";
    tokenStatus.className = "field-status error";
    tokenInput.focus();
  }
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

async function checkToken() {
  if (!tokenInput.value) {
    tokenStatus.textContent = "Required to run research or make decisions.";
    tokenStatus.className = "field-status";
    return false;
  }
  try {
    await api("/api/auth/check");
    localStorage.setItem("adminToken", tokenInput.value);
    tokenStatus.textContent = "Token verified";
    tokenStatus.className = "field-status ok";
    return true;
  } catch (error) {
    return false;
  }
}

tokenInput.addEventListener("change", checkToken);

function sourceLink(item) {
  const a = document.createElement("a");
  a.href = item.url; a.target = "_blank"; a.rel = "noreferrer";
  a.textContent = item.sourceTitle || item.name || item.url;
  return a;
}

function render(rows) {
  list.replaceChildren();
  document.querySelector("#count").textContent = `${rows.length} total`;
  if (!rows.length) { list.innerHTML = '<p class="muted">No research yet. Configure your API key and run the first scan.</p>'; return; }
  for (const row of rows) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".card");
    const badge = node.querySelector(".badge");
    badge.textContent = row.status; badge.classList.add(row.status);
    node.querySelector(".score").textContent = `${row.overallScore}/10`;
    node.querySelector(".title").textContent = row.title;
    node.querySelector(".problem").textContent = row.problem;
    node.querySelector(".customer").textContent = row.customer;
    node.querySelector(".difference").textContent = row.differentiation;
    const evidence = node.querySelector(".evidence");
    for (const item of row.evidence || []) {
      const p = document.createElement("p"); p.append(sourceLink(item), ` — ${item.claim}`); evidence.append(p);
    }
    const plan = node.querySelector(".plan");
    if (row.agencyPlan) {
      const p = row.agencyPlan;
      const features = p.mvpFeatures.map((item) => `<li><strong>${escapeHtml(item.name)}</strong> — ${escapeHtml(item.outcome)}</li>`).join("");
      const assumptions = p.assumptions.map((item) => `<li>${escapeHtml(item.hypothesis)} <em>Pass: ${escapeHtml(item.passMetric)}</em></li>`).join("");
      const interviews = p.validationKit.interviewQuestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
      const tasks = p.tasks.map((item) => `<li><strong>${escapeHtml(item.agent)}</strong> · ${escapeHtml(item.phase)} — ${escapeHtml(item.task)}</li>`).join("");
      const exclusions = p.gate.excludes.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
      plan.innerHTML = `<div class="plan-box"><span class="eyebrow">Agency plan ready</span><h4>${escapeHtml(p.productName)}</h4><p>${escapeHtml(p.executiveSummary)}</p><p><strong>Beachhead:</strong> ${escapeHtml(p.beachhead.vertical)} · ${escapeHtml(p.beachhead.buyer)} · ${escapeHtml(p.beachhead.initialMarket)}</p><p><strong>Offer hypothesis:</strong> ${escapeHtml(p.offer.promise)} · Pilot ${escapeHtml(p.offer.pilotPrice)} · Standard ${escapeHtml(p.offer.standardPrice)}</p><details><summary>MVP scope and assumptions</summary><h4>Five-feature MVP</h4><ul>${features}</ul><h4>Validation assumptions</h4><ul>${assumptions}</ul><p><strong>Not in MVP:</strong> ${p.excludedFromMvp.map(escapeHtml).join(" · ")}</p></details><details><summary>Validation, architecture and agency tasks</summary><h4>Interview script</h4><ul>${interviews}</ul><p><strong>Success gate:</strong> ${escapeHtml(p.validationKit.successGate)}</p><p><strong>Stack:</strong> ${escapeHtml(p.architecture.frontend)} · ${escapeHtml(p.architecture.backend)} · ${escapeHtml(p.architecture.database)}</p><p><strong>Integrations:</strong> ${p.architecture.integrations.map(escapeHtml).join(" · ")}</p><h4>Assigned work</h4><ul>${tasks}</ul></details><div class="gate"><p>${escapeHtml(p.gate.question)}</p><p class="muted">This approval does not authorize:</p><ul>${exclusions}</ul><button class="build-approve">Approve build + private staging</button> <button class="build-reject secondary">Reject plan</button></div></div>`;
      if (p.gate.status !== "awaiting_approval") plan.querySelector(".gate").innerHTML = `<p>Build gate: ${escapeHtml(p.gate.status)}</p>`;
      else {
        plan.querySelector(".build-approve").onclick = () => buildDecision(row.id, "approved");
        plan.querySelector(".build-reject").onclick = () => buildDecision(row.id, "rejected");
      }
      if (row.releaseGate) {
        const gate = document.createElement("div"); gate.className = "gate";
        gate.innerHTML = `<span class="eyebrow">Private staging ready</span><p>${escapeHtml(row.releaseGate.question)}</p><p><a href="/product">Open MVP</a> · <a href="/validate">Preview validation page</a></p><p class="muted">Still excluded: ${row.releaseGate.excludes.map(escapeHtml).join(" · ")}</p><button class="validation-approve">Approve public validation + organic outreach</button> <button class="validation-reject secondary">Reject staging</button>`;
        if (row.releaseGate.status !== "awaiting_approval") gate.innerHTML = `<p>Validation gate: ${escapeHtml(row.releaseGate.status)}</p>`;
        else {
          gate.querySelector(".validation-approve").onclick = () => validationDecision(row.id, "approved");
          gate.querySelector(".validation-reject").onclick = () => validationDecision(row.id, "rejected");
        }
        plan.querySelector(".plan-box").append(gate);
      }
    } else if (row.status === "approved") {
      plan.innerHTML = '<button class="plan-button">Generate agency plan</button>';
      plan.querySelector("button").onclick = () => generatePlan(row.id);
    }
    node.querySelector(".approve").onclick = () => decide(row.id, "approved");
    node.querySelector(".reject").onclick = () => decide(row.id, "rejected");
    if (row.status !== "proposed") node.querySelector(".actions").remove();
    list.append(card);
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[char]));
}

async function generatePlan(id) {
  try { await api(`/api/opportunities/${id}/plan`, { method:"POST", body:"{}" }); await refresh(); }
  catch (error) { alert(error.message); }
}

async function buildDecision(id, status) {
  try { await api(`/api/opportunities/${id}/build-decision`, { method:"POST", body:JSON.stringify({ status }) }); await refresh(); }
  catch (error) { alert(error.message); }
}

async function validationDecision(id, status) {
  try { await api(`/api/opportunities/${id}/validation-decision`, { method:"POST", body:JSON.stringify({ status }) }); await refresh(); }
  catch (error) { alert(error.message); }
}

async function refresh() { render(await api("/api/opportunities")); }
async function decide(id, status) {
  try { await api(`/api/opportunities/${id}/decision`, { method:"POST", body:JSON.stringify({ status }) }); await refresh(); }
  catch (error) { alert(error.message); }
}

runButton.onclick = async () => {
  if (!(await checkToken())) return;
  runButton.disabled = true; runButton.textContent = "Researching…";
  try { await api("/api/research/run", { method:"POST", body:JSON.stringify({ niche:nicheInput.value || undefined }) }); await refresh(); }
  catch (error) { alert(error.message); }
  finally { runButton.disabled = false; runButton.textContent = "Run research"; }
};

Promise.all([api("/health"), api("/api/config")]).then(([health, config]) => {
  document.querySelector("#health").textContent = health.ok ? "System online" : "System issue";
  document.querySelector("#config").textContent = `${config.niche} · ${config.searchProvider} search · ${config.analysisProvider}/${config.model} · ${config.database}`;
  nicheInput.placeholder = config.niche;
}).catch((error) => { document.querySelector("#health").textContent = error.message; });
refresh().catch((error) => { list.textContent = error.message; });
if (tokenInput.value) checkToken();
