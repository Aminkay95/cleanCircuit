const API="https://api.resend.com/emails";
function enabled(){return process.env.EMAIL_MODE==="resend";}
async function sendEmail({to,subject,html,idempotencyKey}){
  if(!enabled())return {provider:"resend_sandbox",id:`email_test_${idempotencyKey}`};
  if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM)throw Object.assign(new Error("RESEND_API_KEY and RESEND_FROM are required"),{status:503});
  const response=await fetch(API,{method:"POST",headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,"Content-Type":"application/json","Idempotency-Key":idempotencyKey},body:JSON.stringify({from:process.env.RESEND_FROM,to:[to],subject,html,reply_to:process.env.RESEND_REPLY_TO||"support@raduconholdings.com"})});
  const body=await response.json();if(!response.ok)throw Object.assign(new Error(body.message||"Resend delivery failed"),{status:502});
  return {provider:"resend",id:body.id};
}
module.exports={enabled,sendEmail};
