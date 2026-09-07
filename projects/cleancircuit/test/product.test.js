const test = require("node:test");
const assert = require("node:assert/strict");
const { requiredString, money } = require("../src/product");

test("product input validation rejects blank strings", () => {
  assert.throws(() => requiredString("  ", "name"), /required/);
  assert.equal(requiredString(" Clean ", "name"), "Clean");
});

test("money accepts non-negative integer cents only", () => {
  assert.equal(money(2500, "amount"), 2500);
  assert.throws(() => money(2.5, "amount"), /non-negative integer/);
  assert.throws(() => money(-1, "amount"), /non-negative integer/);
});
