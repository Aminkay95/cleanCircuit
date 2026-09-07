const test = require("node:test");
const assert = require("node:assert/strict");
const { researchQueries, searchBrave } = require("../src/brave");

test("generates a bounded market-discovery query set", () => {
  const queries = researchQueries("  field   service SaaS ");
  assert.equal(queries.length, 4);
  assert.ok(queries.every((query) => query.includes("field service SaaS")));
});

test("authenticates and normalizes Brave results", async () => {
  process.env.BRAVE_SEARCH_API_KEY = "test-secret";
  let request;
  const fetchImpl = async (url, options) => {
    request = { url: String(url), options };
    return {
      ok: true,
      json: async () => ({ web: { results: [{ title: "Acme", url: "https://acme.test", description: "A product" }] } })
    };
  };
  const results = await searchBrave("test query", { fetchImpl, count: 3 });
  assert.equal(request.options.headers["X-Subscription-Token"], "test-secret");
  assert.match(request.url, /count=3/);
  assert.equal(results[0].url, "https://acme.test");
  delete process.env.BRAVE_SEARCH_API_KEY;
});
