const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPrompt, opportunitySchema } = require("../src/research");

test("research prompt contains safety and scope constraints", () => {
  const prompt = buildPrompt({ niche: "accounting", maxProducts: 3, searchResults: [{ url: "https://example.com" }] });
  assert.match(prompt, /up to 3/);
  assert.match(prompt, /accounting/);
  assert.match(prompt, /Brave Search API/);
  assert.match(prompt, /https:\/\/example.com/);
  assert.match(prompt, /before implementation/);
});

test("opportunity schema requires evidence and scores", () => {
  assert.ok(opportunitySchema.required.includes("evidence"));
  assert.ok(opportunitySchema.required.includes("scores"));
  assert.equal(opportunitySchema.additionalProperties, false);
});
