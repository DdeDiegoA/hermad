"use strict";
const assert = require("assert");
const { test } = require("node:test");
const herdr = require("../src/lib/herdr");

test("agentList descarta los agentes sin nombre (formato real de herdr)", () => {
  const raw = {
    agents: [
      { name: "dev-1", agent: "claude", agent_status: "idle", workspace_id: "w1", pane_id: "w1:p1" },
      { name: null, agent: "claude", agent_status: "idle", workspace_id: "w1", pane_id: "w1:p2" },
      { name: "", agent: "opencode", agent_status: "idle", workspace_id: "w1", pane_id: "w1:p3" },
      { name: "reviewer", agent: "claude", agent_status: "working", workspace_id: "w1", pane_id: "w1:p4" },
    ],
  };
  const out = herdr.agentList(() => raw);
  assert.deepEqual(out.map((a) => a.name), ["dev-1", "reviewer"]);
  assert.equal(out[0].agent_status, "idle", "conserva los demás campos");
});
