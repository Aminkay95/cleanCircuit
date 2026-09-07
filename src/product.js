const express = require("express");

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw Object.assign(new Error(`${name} is required`), { status: 400 });
  return value.trim();
}

function money(value, name) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0) throw Object.assign(new Error(`${name} must be a non-negative integer`), { status: 400 });
  return amount;
}

function createProductRouter(store, authorize) {
  const router = express.Router();
  router.use(authorize);

  router.get("/jobs", async (_req, res, next) => {
    try { res.json(await store.all()); } catch (error) { next(error); }
  });

  router.post("/jobs", async (req, res, next) => {
    try {
      const amountCents = money(req.body.amountCents, "amountCents");
      const depositCents = money(req.body.depositCents, "depositCents");
      if (depositCents > amountCents) return res.status(400).json({ error: "Deposit cannot exceed quote amount" });
      const job = await store.create({
        customerName: requiredString(req.body.customerName, "customerName"),
        customerEmail: requiredString(req.body.customerEmail, "customerEmail"),
        serviceAddress: requiredString(req.body.serviceAddress, "serviceAddress"),
        description: requiredString(req.body.description, "description"),
        serviceDate: requiredString(req.body.serviceDate, "serviceDate"),
        amountCents,
        depositCents
      });
      res.status(201).json(job);
    } catch (error) { next(error); }
  });

  router.post("/jobs/:id/quote/send", transition(store, "quote.sent", (job) => {
    job.quote.status = "sent"; return job;
  }));
  router.post("/jobs/:id/contract/send", transition(store, "contract.sent", (job) => {
    if (job.quote.status !== "sent") throw conflict("Send the quote first");
    job.contract.status = "sent"; job.contract.requestId = `sig_test_${job.id.slice(0, 8)}`; return job;
  }));
  router.post("/jobs/:id/contract/sign", transition(store, "contract.signed", (job) => {
    if (job.contract.status !== "sent") throw conflict("Send the contract first");
    job.contract.status = "signed"; job.contract.signedAt = new Date().toISOString(); return job;
  }));
  router.post("/jobs/:id/schedule", transition(store, "job.scheduled", (job, body) => {
    if (job.contract.status !== "signed") throw conflict("Contract must be signed before scheduling");
    job.schedule = { status: "scheduled", startsAt: requiredString(body.startsAt, "startsAt"), calendarProvider: "sandbox" }; return job;
  }));
  router.post("/jobs/:id/handoff", transition(store, "handoff.sent", (job, body) => {
    if (job.schedule.status !== "scheduled") throw conflict("Schedule the job before hand-off");
    job.handoff = { status: "sent", subcontractor: requiredString(body.subcontractor, "subcontractor"), emailProvider: "sandbox" }; return job;
  }));
  router.post("/jobs/:id/deposit/request", transition(store, "deposit.requested", (job) => {
    if (job.contract.status !== "signed") throw conflict("Contract must be signed before requesting a deposit");
    job.deposit = { status: "requested", provider: "sandbox", checkoutUrl: `sandbox://stripe/${job.id}` }; return job;
  }));
  router.post("/jobs/:id/deposit/confirm", transition(store, "deposit.paid", (job) => {
    if (job.deposit.status !== "requested") throw conflict("Request the deposit first");
    job.deposit.status = "paid"; job.deposit.paidAt = new Date().toISOString(); return job;
  }));

  return router;
}

function conflict(message) { return Object.assign(new Error(message), { status: 409 }); }

function transition(store, event, apply) {
  return async (req, res, next) => {
    try {
      const job = await store.transition(req.params.id, event, (current) => apply(current, req.body || {}));
      if (!job) return res.status(404).json({ error: "Job not found" });
      res.json(job);
    } catch (error) { next(error); }
  };
}

module.exports = { createProductRouter, requiredString, money };
