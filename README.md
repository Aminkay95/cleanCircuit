# SaaS Scout Orchestrator

A local-first, Railway-ready control plane that researches SaaS markets, produces evidence-linked opportunities, and requires a human decision before product planning begins.

This repository is deliberately the **research and approval layer**. It does not clone competitors, deploy generated applications, publish marketing, or spend money automatically.

## Local setup

Requirements: Node.js 18+, a Groq API key, and a Brave Search API key.

```bash
npm install
copy .env.example .env
npm run dev
```

Edit `.env`, set `GROQ_API_KEY`, `BRAVE_SEARCH_API_KEY`, and replace `ADMIN_TOKEN`, then open <http://localhost:3000>. The local version stores opportunities in `data/opportunities.json`.

Generate a strong admin token in PowerShell:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

## Research behavior

Each run uses Brave Search for discovery, then Groq's Responses API with Strict Structured Outputs for analysis. The default production model is `openai/gpt-oss-120b`; change `GROQ_MODEL` if needed. The researcher:

- examines a maximum number of products;
- records evidence URLs and confidence;
- distinguishes observed gaps from business inferences;
- proposes one narrow opportunity and a pre-build validation plan;
- refuses access-control circumvention and direct product cloning;
- leaves the opportunity in `proposed` state until an administrator approves or rejects it.

The default discovery batch is four queries with four results each. Reports are concise and capped to fit entry-level Groq token limits. Increase `BRAVE_RESULTS_PER_QUERY` only after checking your Groq TPM allowance. A structurally incomplete model response is discarded and can be retried after the rate-limit window resets.

Brave results are passed ephemerally to the analysis model. The application persists selected source URLs, titles, queries, and the resulting analysis—not full Brave result snippets. Confirm that your Brave plan grants the storage rights needed for your intended use before production deployment.

## OpenClaw integration

OpenClaw can be the outer scheduler. Configure it to call this service rather than duplicating research state inside an agent session:

```bash
curl -X POST "$SCOUT_URL/api/research/run" \
  -H "Authorization: Bearer $SCOUT_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"niche":"B2C subscription apps for everyday consumers"}'
```

Schedule that action daily or weekly. The endpoint rejects overlapping runs. Keep the admin token in OpenClaw's secret environment, never in an agent prompt or repository.

Alternatively set `RESEARCH_INTERVAL_HOURS=168` for a weekly in-process schedule. Use only one scheduler to avoid duplicate runs.

## Railway deployment

1. Push this repository to a private GitHub repository.
2. Create a Railway project from the repository.
3. Add a Railway PostgreSQL service.
4. Set `DATABASE_URL` from the PostgreSQL service.
5. Set `GROQ_API_KEY`, `BRAVE_SEARCH_API_KEY`, `GROQ_MODEL`, `ADMIN_TOKEN`, and `RESEARCH_NICHE`.
6. Leave `RESEARCH_INTERVAL_HOURS=0` when OpenClaw handles scheduling.
7. Generate a Railway public domain and verify `/health`.

The included `Dockerfile` and `railway.json` provide the build, start command, health check, and restart policy.

## API

- `GET /health` — service health
- `GET /api/config` — non-secret runtime configuration
- `GET /api/auth/check` — authenticated token verification
- `GET /api/opportunities` — opportunity pipeline
- `POST /api/research/run` — authenticated research run
- `POST /api/opportunities/:id/decision` — authenticated approval/rejection
- `POST /api/opportunities/:id/plan` — generate the pre-build agency package for an approved opportunity
- `POST /api/opportunities/:id/build-decision` — crucial gate for implementation and private staging

Mutating endpoints require `Authorization: Bearer <ADMIN_TOKEN>`.

## Next milestone

The planning workflow turns only an `approved` opportunity into a product brief, validation kit, architecture, pricing hypothesis, marketing sequence, and role-based task plan. It then stops at `awaiting_build_approval`. Production deployment, external communication, real payments, and paid marketing remain later approval-gated actions.

## SLA Flow private staging

After build approval, open `/product` to exercise the quote-to-deposit workflow. External integrations are sandbox adapters by design: no email is sent, no legal signature occurs, no calendar is changed, and no payment is processed. Jobs persist locally in `data/service-jobs.json`.

The validation landing-page preview is available at `/validate`. Its signup control remains disabled until the external-validation gate is approved and privacy/consent handling is installed.

After approval, `/validate` accepts consented pilot signups with basic rate limiting and a bot honeypot. Administrators can read them at `GET /api/validation/signups`. Railway PostgreSQL is used automatically for opportunities, product jobs, and signups when `DATABASE_URL` is set.

Set `PUBLIC_BUSINESS_NAME` and a monitored `PUBLIC_CONTACT_EMAIL` before signup collection opens. These values appear in the pilot privacy notice and are deliberately required even after validation approval.

For a fresh Railway database, also set `VALIDATION_ENABLED=true` after the external-validation gate is approved. Keep it `false` to pause collection without redeploying code.
