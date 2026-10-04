"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");
const agents = require("../src/lib/agents");
const daemon = require("../src/lib/daemon");

function tmpProject(name = "hermad") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-agents-"));
  return { projectDir: dir, name };
}

// io con estado REAL (loadState/updateState via daemon) y herdr stubbeado.
function stubIo({ list = [], onStart } = {}) {
  const started = [];
  const io = {
    agentList: () => list,
    agentStart: (n, kind, paneId, args) => {
      started.push({ name: n, kind, paneId, args });
      if (onStart) return onStart(n);
    },
    agentWait: () => {},
    agentPrompt: () => {},
    loadState: (dir) => daemon.loadState(dir),
    updateState: (dir, fn) => daemon.updateState(dir, fn),
    log: () => {},
  };
  return { io, started };
}

function setWorkspace(dir, workspaceId) {
  daemon.updateState(dir, (st) => {
    st.workspaceId = workspaceId;
  });
}

const base = (project, over = {}) => ({ project, logical: "dev", persona: "dev", kind: "claude", paneId: "pane_1", ...over });

test("start con nombre libre: vivo = lógico y registra el mapa completo", () => {
  const project = tmpProject();
  setWorkspace(project.projectDir, "ws-1");
  const { io, started } = stubIo();

  const live = agents.start(base(project, { skills: ["tdd"] }), io);
  assert.equal(live, "dev");
  assert.deepEqual(started.map((s) => s.name), ["dev"]);

  const entry = daemon.loadState(project.projectDir).agents.dev;
  assert.equal(entry.live, "dev");
  assert.equal(entry.persona, "dev");
  assert.equal(entry.kind, "claude");
  assert.equal(entry.paneId, "pane_1");
  assert.equal(entry.workspaceId, "ws-1");
  assert.deepEqual(entry.skills, ["tdd"]);
});

test("start con el lógico tomado en OTRO workspace: usa <slug>-<lógico>", () => {
  const project = tmpProject("hermad");
  setWorkspace(project.projectDir, "ws-1");
  const { io, started } = stubIo({ list: [{ name: "dev", workspace_id: "ws-2" }] });

  const live = agents.start(base(project), io);
  assert.equal(live, "hermad-dev");
  assert.deepEqual(started.map((s) => s.name), ["hermad-dev"]);
  assert.equal(daemon.loadState(project.projectDir).agents.dev.live, "hermad-dev");
});

test("start con el lógico ya vivo en NUESTRO workspace: reusa, no re-arranca", () => {
  const project = tmpProject();
  setWorkspace(project.projectDir, "ws-1");
  const { io, started } = stubIo({ list: [{ name: "dev", workspace_id: "ws-1" }] });

  const live = agents.start(base(project), io);
  assert.equal(live, "dev");
  assert.equal(started.length, 0, "no vuelve a llamar agentStart");
});

test("carrera agent_name_taken: reintenta UNA vez con el alias", () => {
  const project = tmpProject("hermad");
  setWorkspace(project.projectDir, "ws-1");
  const fail = (n) => {
    if (n === "dev") {
      const e = new Error("taken");
      e.code = "agent_name_taken";
      throw e;
    }
  };
  const { io, started } = stubIo({ onStart: fail });

  const live = agents.start(base(project), io);
  assert.equal(live, "hermad-dev");
  assert.deepEqual(started.map((s) => s.name), ["dev", "hermad-dev"]);
});

test("alias también tomado: error que nombra los dos, sin sufijos numéricos", () => {
  const project = tmpProject("hermad");
  setWorkspace(project.projectDir, "ws-1");
  const { io, started } = stubIo({
    list: [
      { name: "dev", workspace_id: "ws-2" },
      { name: "hermad-dev", workspace_id: "ws-9" },
    ],
  });

  assert.throws(() => agents.start(base(project), io), (err) => {
    assert.equal(err.code, "agent_name_taken");
    assert.match(err.message, /'dev'/);
    assert.match(err.message, /'hermad-dev'/);
    assert.doesNotMatch(err.message, /-\d/);
    return true;
  });
  assert.equal(started.length, 0);
});

test("alias también tomado por carrera: mismo error explícito", () => {
  const project = tmpProject("hermad");
  setWorkspace(project.projectDir, "ws-1");
  const { io } = stubIo({
    onStart: () => {
      const e = new Error("taken");
      e.code = "agent_name_taken";
      throw e;
    },
  });
  assert.throws(() => agents.start(base(project), io), /'dev'.*'hermad-dev'/);
});

test("liveName / logicalOf: resuelven el mapa y caen a la identidad", () => {
  const project = tmpProject();
  daemon.updateState(project.projectDir, (st) => {
    st.agents = { dev: { live: "hermad-dev" } };
  });
  assert.equal(agents.liveName(project.projectDir, "dev"), "hermad-dev");
  assert.equal(agents.liveName(project.projectDir, "architect"), "architect");
  assert.equal(agents.logicalOf(project.projectDir, "hermad-dev"), "dev");
  assert.equal(agents.logicalOf(project.projectDir, "legacy"), "legacy");
});

test("slug normaliza a [a-z0-9-] y cae al basename sin nombre", () => {
  assert.equal(agents.slug("My Proj!"), "my-proj");
  assert.equal(agents.slug("Hermad"), "hermad");
  assert.equal(agents.slug(null, "/tmp/foo-bar"), "foo-bar");
});

test("start limpia state.closed del lógico en el mismo updateState del alta", () => {
  const project = tmpProject();
  setWorkspace(project.projectDir, "ws-1");
  daemon.updateState(project.projectDir, (st) => {
    st.closed = { dev: { at: Date.now(), live: "dev", paneId: "pane-0", persona: "dev" } };
  });
  const { io } = stubIo();

  const live = agents.start(base(project), io);
  assert.equal(live, "dev");
  const st = daemon.loadState(project.projectDir);
  assert.equal(st.closed.dev, undefined, "el alta limpia la baja (el daemon le vuelve a entregar el buzón)");
  assert.ok(st.agents.dev, "queda registrado en agents");
});
