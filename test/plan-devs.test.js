"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");
const daemon = require("../src/lib/daemon");
const { allocateDevs, startDev } = require("../src/commands/plan-devs");

test("allocateDevs salta los nombres de devs vivos (no pisa a un dev de otra story)", () => {
  assert.deepEqual(allocateDevs([], 3), ["dev-1", "dev-2", "dev-3"]);
  assert.deepEqual(allocateDevs(["dev-1"], 2), ["dev-2", "dev-3"]);
  assert.deepEqual(allocateDevs(["dev-1", "dev-3"], 3), ["dev-2", "dev-4", "dev-5"]);
});

// io con estado REAL (loadState/updateState via daemon) y herdr stubbeado.
function stubIo({ list = [] } = {}) {
  const started = [];
  return {
    started,
    io: {
      agentList: () => list,
      agentStart: (n) => started.push(n),
      agentWait: () => {},
      agentPrompt: () => {},
      loadState: (dir) => daemon.loadState(dir),
      updateState: (dir, fn) => daemon.updateState(dir, fn),
      log: () => {},
    },
  };
}

test("startDev arranca por agents.start y registra el alias en state.agents", () => {
  const project = { projectDir: fs.mkdtempSync(path.join(os.tmpdir(), "hermad-plandevs-")), name: "hermad" };
  daemon.updateState(project.projectDir, (s) => {
    s.workspaceId = "ws-1";
  });
  // el lógico dev-1 ya está tomado en OTRO workspace → alias <slug>-dev-1.
  const { io, started } = stubIo({ list: [{ name: "dev-1", workspace_id: "ws-2" }] });

  const live = startDev(project, { dev: "dev-1", persona: "dev", kind: "claude", paneId: "pane_1", args: [], promptText: null }, io);
  assert.equal(live, "hermad-dev-1");
  assert.deepEqual(started, ["hermad-dev-1"], "arranca con el alias, no con dev-1");

  const entry = daemon.loadState(project.projectDir).agents["dev-1"];
  assert.equal(entry.live, "hermad-dev-1");
  assert.equal(entry.persona, "dev");
  assert.equal(entry.paneId, "pane_1");
});
