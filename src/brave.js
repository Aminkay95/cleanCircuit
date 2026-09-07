const ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

function researchQueries(niche) {
  const clean = String(niche).trim().replace(/\s+/g, " ");
  return [
    `${clean} software SaaS pricing`,
    `${clean} SaaS alternatives missing features`,
    `${clean} software complaints feature requests`,
    `${clean} SaaS changelog roadmap integrations`
  ];
}

async function searchBrave(query, { count = 4, fetchImpl = fetch } = {}) {
  if (!process.env.BRAVE_SEARCH_API_KEY) {
    const error = new Error("BRAVE_SEARCH_API_KEY is required to run market discovery");
    error.status = 503;
    throw error;
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(Math.max(count, 1), 20)));
  url.searchParams.set("safesearch", "moderate");

  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY
    },
    signal: AbortSignal.timeout(20_000)
  });

  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    const error = new Error(`Brave Search failed (${response.status})${retryAfter ? `; retry after ${retryAfter}s` : ""}`);
    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }

  const body = await response.json();
  return (body.web?.results || []).map((item) => ({
    title: item.title,
    url: item.url,
    description: (item.description || "").slice(0, 400),
    age: item.age || null,
    query
  }));
}

async function discoverMarket(niche, options = {}) {
  const count = Number(options.count || process.env.BRAVE_RESULTS_PER_QUERY || 4);
  const batches = [];
  // Sequential requests remain friendly to low-tier per-second limits.
  for (const query of researchQueries(niche)) {
    batches.push(await searchBrave(query, { count, fetchImpl: options.fetchImpl }));
  }
  const unique = new Map();
  for (const result of batches.flat()) {
    if (!unique.has(result.url)) unique.set(result.url, result);
  }
  return [...unique.values()];
}

module.exports = { discoverMarket, searchBrave, researchQueries, ENDPOINT };
