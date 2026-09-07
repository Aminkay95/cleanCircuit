# Raducon SaaS Agency

The agency researches opportunities with Brave and Groq, generates plans and tracks approvals. Products live independently under `projects/<project-slug>/`.

## Local development

Agency: `npm ci` then `npm start` at the repository root. Configure the root `.env` using `.env.example`. Default URL: http://localhost:3000.

CleanCircuit: `npm ci` then `npm start` inside `projects/cleancircuit`. It has its own `.env`, admin token, dependencies, tests, product data and deployment files. Default URL: http://localhost:3001. Its landing page is `/`, and its administrator-operated MVP is `/product`.

Run `npm test` in each package. Local product records have been moved into `projects/cleancircuit/data/`. The agency retains opportunities in root `data/`. Use separate PostgreSQL databases when deployed. Previously hosted records, if any, require a separate migration.

## Project workflow

Build approval creates `projects/<project-slug>/project.json` and assigns that directory to all build tasks. Name collisions are rejected. The dashboard lists project directories. This allocates the workspace; it does not automatically implement the product. Every product owns its source, assets, secrets, storage and deployment. See projects/README.md.

## Deployment

Deploy the agency from the repository root. Deploy only CleanCircuit by setting the hosting root directory to `projects/cleancircuit`. Both use build command `npm ci`, start command `npm start` and health path `/health`. Docker builds use the respective package directory as context.

Use separate environment variables and databases. CleanCircuit needs no Groq/Brave credentials. The agency needs no payment/email credentials. CleanCircuit's VALIDATION_ENABLED setting controls signup availability; it does not read agency approval records. Applying a recorded approval to a hosted product is a release step.

The root Docker build excludes products. Both Docker builds exclude secrets and local data. Newly generated project folders on a hosted agency require persistent storage or committing through the development workflow.

## Agency API

- GET /health — health
- GET /api/config — research configuration
- GET /api/auth/check — authenticated token verification
- GET /api/projects — authenticated project listing
- GET /api/opportunities — opportunity pipeline
- POST /api/research/run — authenticated research
- POST /api/opportunities/:id/decision — opportunity approval
- POST /api/opportunities/:id/plan — planning
- POST /api/opportunities/:id/build-decision — build approval and workspace allocation
- POST /api/opportunities/:id/validation-decision — validation approval

RESEARCH_INTERVAL_HOURS enables an in-process schedule only on an always-running host. Sleeping hosts require external scheduling and resumable execution. Public launch, outreach and live payments are separate release actions.
