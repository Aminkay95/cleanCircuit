const token = document.querySelector("#token");
const status = document.querySelector("#auth-status");
const jobs = document.querySelector("#jobs");
token.value = localStorage.getItem("adminToken") || "";

async function api(path, options={}) {
  const response = await fetch(path,{...options,headers:{"content-type":"application/json",authorization:`Bearer ${token.value}`}});
  const body=await response.json();
  if(!response.ok) throw new Error(body.error||"Request failed");
  return body;
}

function esc(value){return String(value??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function button(label, action, disabled=false){return `<button data-action="${action}" ${disabled?"disabled":""}>${label}</button>`;}

async function load(){
  try {
    await api("/api/auth/check"); status.textContent="Token verified"; status.style.color="#7df5af"; localStorage.setItem("adminToken",token.value);
    render(await api("/api/product/jobs"));
  } catch(error){status.textContent=error.message;status.style.color="#ff9e9e";}
}

function render(rows){
  jobs.replaceChildren(); if(!rows.length){jobs.innerHTML='<p>No jobs yet. Create the first quote.</p>';return;}
  for(const job of rows){
    const article=document.querySelector("#job-template").content.cloneNode(true);
    article.querySelector(".quote-number").textContent=job.quote.number;
    article.querySelector(".customer").textContent=job.customer.name;
    article.querySelector(".amount").textContent=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(job.service.amountCents/100);
    article.querySelector(".description").textContent=`${job.service.description} · ${job.customer.address}`;
    const steps=article.querySelector(".steps");
    steps.innerHTML=`<div class="step ${job.quote.status==='sent'?'done':''}"><span>QUOTE · ${esc(job.quote.status)}</span>${button("Send quote","quote",job.quote.status==='sent')}</div><div class="step ${job.contract.status==='signed'?'done':''}"><span>CONTRACT · ${esc(job.contract.status)}</span>${job.contract.status==='not_sent'?button("Send contract","contract-send",job.quote.status!=='sent'):button("Mark signed","contract-sign",job.contract.status==='signed')}</div><div class="step ${job.schedule.status==='scheduled'?'done':''}"><span>SCHEDULE · ${esc(job.schedule.status)}</span>${button("Schedule","schedule",job.contract.status!=='signed'||job.schedule.status==='scheduled')}</div><div class="step ${job.handoff.status==='sent'?'done':''}"><span>HAND-OFF · ${esc(job.handoff.status)}</span>${button("Send hand-off","handoff",job.schedule.status!=='scheduled'||job.handoff.status==='sent')}</div><div class="step ${job.deposit.status==='paid'?'done':''}"><span>DEPOSIT · ${esc(job.deposit.status)}</span>${job.deposit.status==='not_requested'?button("Request deposit","deposit-request",job.contract.status!=='signed'):button("Confirm sandbox payment","deposit-confirm",job.deposit.status==='paid')}</div>`;
    steps.onclick=(event)=>{const action=event.target.dataset.action;if(action)act(job.id,action);};
    article.querySelector(".timeline").innerHTML=job.timeline.map(item=>`<li>${esc(new Date(item.at).toLocaleString())} — ${esc(item.event)}</li>`).join("");
    jobs.append(article);
  }
}

async function act(id,action){
  let path,body={};
  if(action==="quote")path="quote/send";
  if(action==="contract-send")path="contract/send";
  if(action==="contract-sign")path="contract/sign";
  if(action==="deposit-request")path="deposit/request";
  if(action==="deposit-confirm")path="deposit/confirm";
  if(action==="schedule"){path="schedule";body.startsAt=prompt("Start date and time (ISO)",new Date().toISOString());if(!body.startsAt)return;}
  if(action==="handoff"){path="handoff";body.subcontractor=prompt("Subcontractor name");if(!body.subcontractor)return;}
  try{await api(`/api/product/jobs/${id}/${path}`,{method:"POST",body:JSON.stringify(body)});await load();}catch(error){alert(error.message);}
}

document.querySelector("#quote-form").onsubmit=async(event)=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.target));data.amountCents=Math.round(Number(data.amount)*100);data.depositCents=Math.round(Number(data.deposit)*100);delete data.amount;delete data.deposit;try{await api("/api/product/jobs",{method:"POST",body:JSON.stringify(data)});event.target.reset();await load();}catch(error){alert(error.message);}};
token.onchange=load;document.querySelector("#refresh").onclick=load;if(token.value)load();
