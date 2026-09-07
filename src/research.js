const crypto = require("node:crypto");
const OpenAI = require("openai");
const { discoverMarket } = require("./brave");

const opportunitySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    niche: { type: "string" },
    customer: { type: "string" },
    problem: { type: "string" },
    proposedSolution: { type: "string" },
    differentiation: { type: "string" },
    validationPlan: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    competitors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          url: { type: "string" },
          currentStrength: { type: "string" },
          observedGap: { type: "string" }
        },
        required: ["name", "url", "currentStrength", "observedGap"]
      }
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          claim: { type: "string" },
          url: { type: "string" },
          sourceTitle: { type: "string" },
          confidence: { type: "string", enum: ["low", "medium", "high"] }
        },
        required: ["claim", "url", "sourceTitle", "confidence"]
      }
    },
    scores: {
      type: "object",
      additionalProperties: false,
      properties: {
        pain: { type: "integer", minimum: 1, maximum: 10 },
        willingnessToPay: { type: "integer", minimum: 1, maximum: 10 },
        reachability: { type: "integer", minimum: 1, maximum: 10 },
        differentiation: { type: "integer", minimum: 1, maximum: 10 },
        feasibility: { type: "integer", minimum: 1, maximum: 10 }
      },
      required: ["pain", "willingnessToPay", "reachability", "differentiation", "feasibility"]
    }
  },
  required: ["title", "niche", "customer", "problem", "proposedSolution", "differentiation", "validationPlan", "risks", "competitors", "evidence", "scores"]
};

function buildPrompt({ niche, maxProducts, searchResults = [] }) {
  return `Act as a cautious SaaS market researcher. Analyze up to ${maxProducts} SaaS products in this niche: ${niche}.

The discovery results below came from the Brave Search API. Treat snippets as leads, not unquestionable facts. Use ONLY URLs present in these results for competitor and evidence URL fields. Do not claim you directly visited or read any page. Never recommend copying branding, text, code, or a whole product.

Find ONE narrow, differentiated opportunity based on observable missing workflows or underserved customers. Separate evidence from inference. Every material market claim must have a supplied URL. Prefer first-party sources. A complaint is not proof of willingness to pay, so include a cheap validation plan before implementation. Scores are 1-10.

Be concise so the complete JSON fits the output budget: use exactly 3 competitors, 3 evidence items, 3 validation steps, and no more than 3 risks. Keep every descriptive string under 35 words. Fill every required field, especially evidence and scores. Return only the specified structured result.

BRAVE SEARCH RESULTS:
${JSON.stringify(searchResults)}`;
}

function annotationsFrom(response) {
  const seen = new Set();
  const sources = [];
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const part of item.content || []) {
      for (const annotation of part.annotations || []) {
        if (annotation.type !== "url_citation" || seen.has(annotation.url)) continue;
        seen.add(annotation.url);
        sources.push({ url: annotation.url, title: annotation.title || annotation.url });
      }
    }
  }
  return sources;
}

async function researchOpportunity(options) {
  if (!process.env.GROQ_API_KEY) {
    const error = new Error("GROQ_API_KEY is required to run live research analysis");
    error.status = 503;
    throw error;
  }

  const searchResults = await discoverMarket(options.niche);
  if (!searchResults.length) {
    const error = new Error("Brave Search returned no results for this niche");
    error.status = 422;
    throw error;
  }

  const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
  });
  const response = await client.responses.create({
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    input: buildPrompt({ ...options, searchResults }),
    max_output_tokens: 2800,
    text: {
      format: {
        type: "json_schema",
        name: "saas_opportunity",
        strict: true,
        schema: opportunitySchema
      }
    }
  });

  const result = JSON.parse(response.output_text);
  const allowedUrls = new Set(searchResults.map((item) => item.url));
  result.evidence = result.evidence.filter((item) => allowedUrls.has(item.url));
  result.competitors = result.competitors.filter((item) => allowedUrls.has(item.url));
  const citedUrls = new Set([
    ...result.evidence.map((item) => item.url),
    ...result.competitors.map((item) => item.url)
  ]);
  const scores = Object.values(result.scores);
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "proposed",
    overallScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    ...result,
    searchSources: searchResults
      .filter((item) => citedUrls.has(item.url))
      .map(({ title, url, query }) => ({ title, url, query })),
    run: { model: response.model, responseId: response.id }
  };
}

module.exports = { researchOpportunity, buildPrompt, opportunitySchema };
