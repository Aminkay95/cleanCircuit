const test = require("node:test");
const assert = require("node:assert/strict");
const { ROSTER, buildTasks, planningPrompt } = require("../src/agency");

test("agency roster covers build, validation, release and growth", () => {
  assert.ok(ROSTER.length >= 10);
  for (const id of ["ux-researcher", "rapid-prototyper", "security-engineer", "growth-hacker"]) {
    assert.ok(ROSTER.some((agent) => agent.id === id));
  }
});

test("planning prompt preserves crucial approval boundaries", () => {
  const prompt = planningPrompt({ title:"Test", niche:"B2B", customer:"Owner", problem:"Chaos", proposedSolution:"Workflow", differentiation:"Simple", scores:{}, risks:[] });
  assert.match(prompt, /remain approval-gated/);
  assert.match(prompt, /one narrow beachhead/);
});

test("generated task map spans agency phases", () => {
  const tasks = buildTasks({ validationKit:{ successGate:"Five interviews" }, goToMarket:{ northStarMetric:"Activated pilots" } });
  assert.deepEqual([...new Set(tasks.map((task) => task.phase))], ["validate", "build", "release", "launch"]);
});
