const crypto = require("node:crypto");

const API = "https://api.paystack.co";

function enabled() { return process.env.PAYMENTS_MODE === "paystack"; }

async function initializeDeposit({ email, amountCents, reference, callbackUrl }) {
  if (!enabled()) return { provider:"paystack_sandbox", reference, authorizationUrl:`sandbox://paystack/${reference}` };
  if (!process.env.PAYSTACK_SECRET_KEY) throw Object.assign(new Error("PAYSTACK_SECRET_KEY is not configured"),{status:503});
  const response=await fetch(`${API}/transaction/initialize`,{method:"POST",headers:{Authorization:`Bearer ${process.env.PAYSTACK_SECRET_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({email,amount:String(amountCents),reference,currency:process.env.PAYSTACK_CURRENCY||"USD",callback_url:callbackUrl})});
  const body=await response.json(); if(!response.ok||!body.status) throw Object.assign(new Error(body.message||"Paystack initialization failed"),{status:502});
  return {provider:"paystack",reference:body.data.reference,authorizationUrl:body.data.authorization_url,accessCode:body.data.access_code};
}

function verifyWebhook(payload, signature) {
  if (!process.env.PAYSTACK_SECRET_KEY || typeof signature !== "string") return false;
  const expected=crypto.createHmac("sha512",process.env.PAYSTACK_SECRET_KEY).update(JSON.stringify(payload)).digest("hex");
  if(expected.length!==signature.length)return false;
  return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature));
}

module.exports={enabled,initializeDeposit,verifyWebhook};
