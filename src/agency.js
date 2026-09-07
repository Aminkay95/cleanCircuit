const OpenAI = require("openai");

const ROSTER = [
  { id: "product-strategist", division: "strategy", responsibility: "Positioning, beachhead and business assumptions" },
  { id: "reality-checker", division: "strategy", responsibility: "Disprove weak assumptions before build" },
  { id: "ux-researcher", division: "design", responsibility: "Interviews, survey and validation evidence" },
  { id: "product-manager", division: "product", responsibility: "MVP scope and acceptance criteria" },
  { id: "software-architect", division: "engineering", responsibility: "Architecture, data model and boundaries" },
  { id: "rapid-prototyper", division: "engineering", responsibility: "Implementation after build approval" },
  { id: "security-engineer", division: "security", responsibility: "Threat review and release controls" },
  { id: "qa-engineer", division: "testing", responsibility: "Acceptance, integration and regression tests" },
  { id: "devops-automator", division: "engineering", responsibility: "Staging, observability and release" },
  { id: "growth-hacker", division: "marketing", responsibility: "Acquisition experiments and funnel metrics" },
  { id: "content-creator", division: "marketing", responsibility: "Landing copy and organic launch assets" }
];

const planSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    productName: { type: "string" },
    executiveSummary: { type: "string" },
    beachhead: {
      type: "object", additionalProperties: false,
      properties: { vertical: { type: "string" }, buyer: { type: "string" }, jobToBeDone: { type: "string" }, initialMarket: { type: "string" } },
      required: ["vertical", "buyer", "jobToBeDone", "initialMarket"]
    },
    offer: {
      type: "object", additionalProperties: false,
      properties: { promise: { type: "string" }, pilotPrice: { type: "string" }, standardPrice: { type: "string" }, guarantee: { type: "string" } },
      required: ["promise", "pilotPrice", "standardPrice", "guarantee"]
    },
    assumptions: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: { hypothesis: { type: "string" }, test: { type: "string" }, passMetric: { type: "string" } },
        required: ["hypothesis", "test", "passMetric"]
      }
    },
    mvpFeatures: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: { name: { type: "string" }, outcome: { type: "string" }, acceptance: { type: "string" } },
        required: ["name", "outcome", "acceptance"]
      }
    },
    excludedFromMvp: { type: "array", items: { type: "string" } },
    architecture: {
      type: "object", additionalProperties: false,
      properties: { frontend: { type: "string" }, backend: { type: "string" }, database: { type: "string" }, integrations: { type: "array", items: { type: "string" } }, security: { type: "array", items: { type: "string" } } },
      required: ["frontend", "backend", "database", "integrations", "security"]
    },
    validationKit: {
      type: "object", additionalProperties: false,
      properties: {
        headline: { type: "string" }, subheadline: { type: "string" }, cta: { type: "string" },
        interviewQuestions: { type: "array", items: { type: "string" } },
        surveyQuestions: { type: "array", items: { type: "string" } },
        outreachMessage: { type: "string" }, successGate: { type: "string" }
      },
      required: ["headline", "subheadline", "cta", "interviewQuestions", "surveyQuestions", "outreachMessage", "successGate"]
    },
    goToMarket: {
      type: "object", additionalProperties: false,
      properties: { channels: { type: "array", items: { type: "string" } }, launchSequence: { type: "array", items: { type: "string" } }, northStarMetric: { type: "string" } },
      required: ["channels", "launchSequence", "northStarMetric"]
    },
    criticalRisks: { type: "array", items: { type: "string" } }
  },
  required: ["productName", "executiveSummary", "beachhead", "offer", "assumptions", "mvpFeatures", "excludedFromMvp", "architecture", "validationKit", "goToMarket", "criticalRisks"]
};

function planningPrompt(opportunity) {
  const brief = {
    title: opportunity.title,
    niche: opportunity.niche,
    customer: opportunity.customer,
    problem: opportunity.problem,
    proposedSolution: opportunity.proposedSolution,
    differentiation: opportunity.differentiation,
    scores: opportunity.scores,
    risks: opportunity.risks
  };
  return `You are the planning council for a lean AI software agency. Turn the approved opportunity into a concrete pre-build package. Do not assume the market is validated. Choose one narrow beachhead vertical, preferably cleaning or plumbing businesses, rather than serving every service business.

Use exactly 3 assumptions, 5 MVP features, 5 exclusions, 5 interview questions, 5 survey questions, 3 acquisition channels, 4 launch steps, and at most 4 critical risks. Every string must be concise (under 30 words). MVP acceptance criteria must be testable. Prefer a simple web stack, Stripe deposits, email notifications, and an e-sign provider; do not build payments or signatures from scratch. External outreach, ad spend, production deployment, and customer-data access remain approval-gated.

APPROVED OPPORTUNITY:
Every product must be implemented in its own projects/<project-slug>/ directory, with independent dependencies, environment, data and deployment. Never add product routes or customer data to the agency application.
${JSON.stringify(brief)}`;
}

function buildTasks(plan) {
  return [
    { agent: "ux-researcher", phase: "validate", task: "Run interviews and survey", doneWhen: plan.validationKit.successGate },
    { agent: "product-strategist", phase: "validate", task: "Test offer and pricing", doneWhen: "At least two buyers accept the pilot price" },
    { agent: "product-manager", phase: "build", task: "Convert MVP features into issues", doneWhen: "Every feature has acceptance criteria and an owner" },
    { agent: "software-architect", phase: "build", task: "Create schema and architecture decision record", doneWhen: "Security and failure paths are documented" },
    { agent: "rapid-prototyper", phase: "build", task: "Implement the approved MVP", doneWhen: "All acceptance tests pass in staging" },
    { agent: "security-engineer", phase: "release", task: "Review auth, secrets, billing and tenancy", doneWhen: "No unresolved high-severity findings" },
    { agent: "qa-engineer", phase: "release", task: "Execute critical journey tests", doneWhen: "Quote-to-deposit workflow passes" },
    { agent: "devops-automator", phase: "release", task: "Deploy monitored staging environment", doneWhen: "Health, logs, backups and rollback are verified" },
    { agent: "growth-hacker", phase: "launch", task: "Run approved acquisition tests", doneWhen: plan.goToMarket.northStarMetric },
    { agent: "content-creator", phase: "launch", task: "Prepare landing and launch content", doneWhen: "Claims match validated customer evidence" }
  ];
}

async function createAgencyPlan(opportunity) {
  if (!process.env.GROQ_API_KEY) throw Object.assign(new Error("GROQ_API_KEY is required"), { status: 503 });
  const client = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });
  const response = await client.responses.create({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    input: planningPrompt(opportunity),
    max_output_tokens: 3400,
    text: { format: { type: "json_schema", name: "agency_plan", strict: true, schema: planSchema } }
  });
  const plan = JSON.parse(response.output_text);
  return {
    ...plan,
    createdAt: new Date().toISOString(),
    model: response.model,
    responseId: response.id,
    roster: ROSTER,
    tasks: buildTasks(plan),
    gate: {
      id: "build-and-validation",
      status: "awaiting_approval",
      question: "Approve MVP implementation, validation assets, and a private staging deployment?",
      allows: ["Create application code", "Create validation landing page", "Prepare outreach drafts", "Deploy private staging"],
      excludes: ["Send external messages", "Spend advertising money", "Deploy production", "Process real customer payments"]
    }
  };
}

module.exports = { createAgencyPlan, planSchema, planningPrompt, buildTasks, ROSTER };
