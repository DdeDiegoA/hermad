"use strict";
const assert = require("assert");
const cp = require("child_process");
const { test, afterEach } = require("node:test");
const herdr = require("../src/lib/herdr");

const realExec = cp.execFileSync;
afterEach(() => {
  cp.execFileSync = realExec;
});

// stub de execFileSync que registra argv y devuelve/throws lo que se le pida.
function stub(fn) {
  const calls = [];
  cp.execFileSync = (bin, args, opts) => {
    calls.push({ bin, args, opts });
    return fn(bin, args, opts);
  };
  return calls;
}

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

test("agentRead devuelve el texto crudo del pane, sin JSON.parse", () => {
  const screen = "❯\n  ⏵⏵ bypass permissions on\nHERMAD:DONE story=S2 n=1\n";
  const calls = stub(() => screen);
  const out = herdr.agentRead("dev-2", { source: "visible" });
  assert.equal(out, screen, "devuelve stdout tal cual");
  assert.deepEqual(calls[0].args, ["agent", "read", "dev-2", "--source", "visible", "--format", "text"]);
});

test("agentRead propaga el error de herdr (el daemon lo saltea)", () => {
  stub(() => {
    throw new Error("herdr agent read dev-2 falló");
  });
  assert.throws(() => herdr.agentRead("dev-2"), /falló/);
});

test("paneClose ejecuta el comando correcto y devuelve ok", () => {
  const calls = stub(() => "{}");
  assert.deepEqual(herdr.paneClose("w1:p1"), { ok: true });
  assert.deepEqual(calls[0].args, ["pane", "close", "w1:p1"]);
});

test("paneClose no tira y expone el code de herdr", () => {
  stub(() => {
    const err = new Error("not found");
    err.stdout = JSON.stringify({ error: { code: "pane_not_found", message: "no existe" } });
    throw err;
  });
  assert.deepEqual(herdr.paneClose("w1:dead"), { ok: false, code: "pane_not_found" });
});

test("tabRename ejecuta el comando correcto y devuelve ok", () => {
  const calls = stub(() => "{}");
  assert.deepEqual(herdr.tabRename("w1:t1", "gerencia"), { ok: true });
  assert.deepEqual(calls[0].args, ["tab", "rename", "w1:t1", "gerencia"]);
});

test("tabRename no tira ante un fallo de herdr", () => {
  stub(() => {
    throw new Error("sin stdout");
  });
  assert.deepEqual(herdr.tabRename("w1:t1", "gerencia"), { ok: false, code: null });
});
