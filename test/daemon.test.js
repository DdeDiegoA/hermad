"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");
const daemon = require("../src/lib/daemon");

function project(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-daemon-"));
  return {
    projectDir: dir,
    compactPct: 50,
    personas: { dev: { kind: "claude" }, reviewer: { kind: "claude" }, orquestador: { kind: "claude" }, pm: { kind: "claude" } },
    routes: [
      { on: "DONE", from: "dev", to: "reviewer" },
      { on: "BUG", from: "reviewer", to: "dev" },
    ],
    ...overrides,
  };
}

function stubIo({ list, read, prompt }) {
  const sent = [];
  const prompted = [];
  return {
    sent,
    prompted,
    io: {
      agentList: () => list,
      agentRead: (name) => read[name] || "",
      agentPrompt: (name, text) => prompted.push({ name, text }),
      send: (m) => sent.push(m),
      log: () => {},
    },
    prompt,
  };
}

test("parseMarkers extrae evento/story/extra", () => {
  const mk = daemon.parseMarkers("hola HERMAD:DONE story=S1 files=2 luego");
  assert.deepEqual(mk, [{ event: "DONE", story: "S1", extra: { files: "2" }, raw: "HERMAD:DONE story=S1 files=2" }]);
});

test("BUG al 3er rebote escala al orquestador en vez del dev", () => {
  const p = project();
  const { io, sent } = stubIo({ list: [], read: {}, prompt: [] });
  const state = { rebounds: {}, screens: {}, processed: [] };
  const mk = { event: "BUG", story: "S1", extra: {} };
  daemon.applyRoute(p, { fromPersona: "reviewer", ...mk }, state, io);
  daemon.applyRoute(p, { fromPersona: "reviewer", ...mk }, state, io);
  assert.ok(sent.every((m) => m.to === "dev"));
  daemon.applyRoute(p, { fromPersona: "reviewer", ...mk }, state, io);
  assert.equal(sent[sent.length - 1].to, "orquestador");
});

test("runOnce entrega buzón en idle y aplica la ruta DONE una sola vez", () => {
  const p = project();
  daemon.send(p.projectDir, { from: "orquestador", to: "dev", text: "haz S1" });
  const list = [{ name: "dev", agent_status: "idle" }];
  const read = { dev: "trabajando... luego HERMAD:DONE story=S1" };
  const { io, sent, prompted } = stubIo({ list, read });

  daemon.runOnce(p, io);
  assert.ok(prompted.some((m) => m.name === "dev" && /haz S1/.test(m.text)), "entrega el buzón");
  assert.ok(sent.some((m) => m.to === "reviewer" && /DONE.*story=S1/.test(m.text)), "rutea DONE a reviewer");

  const before = sent.length;
  daemon.runOnce(p, io); // misma pantalla + buzón ya en done/
  assert.equal(sent.length, before, "no reprocesa el mismo marcador ni reentrega");
});

test("runOnce no entrega a un agente blocked", () => {
  const p = project();
  daemon.send(p.projectDir, { from: "orquestador", to: "dev", text: "haz S1" });
  const { io, prompted } = stubIo({ list: [{ name: "dev", agent_status: "blocked" }], read: { dev: "" } });
  daemon.runOnce(p, io);
  assert.equal(prompted.length, 0);
});

test("devs paralelos (dev-1) se mapean a la persona dev y rutean DONE→reviewer", () => {
  const p = project();
  const { io, sent } = stubIo({ list: [{ name: "dev-1", agent_status: "idle" }], read: { "dev-1": "HERMAD:DONE story=S1" } });
  daemon.runOnce(p, io);
  assert.ok(sent.some((m) => m.to === "reviewer" && /story=S1/.test(m.text)));
});

test("un marcador que la TUI vuelve a dibujar no se dispara de nuevo", () => {
  const p = project({ routes: [{ on: "DONE", from: "dev", to: "reviewer" }] });
  const screens = ["HERMAD:DONE story=S1", "otra cosa", "HERMAD:DONE story=S1"];
  let i = 0;
  const sent = [];
  const io = {
    agentList: () => [{ name: "dev", agent_status: "idle" }],
    agentRead: () => screens[Math.min(i++, screens.length - 1)],
    agentPrompt: () => {},
    send: (m) => sent.push(m),
    log: () => {},
  };
  daemon.runOnce(p, io);
  daemon.runOnce(p, io);
  daemon.runOnce(p, io);
  assert.equal(sent.filter((m) => m.to === "reviewer").length, 1, "el redibujo no re-dispara");
});

test("un 2.º BUG legítimo se distingue con el contador n=", () => {
  const p = project();
  const screens = ["HERMAD:BUG story=S1 n=1", "arreglando", "HERMAD:BUG story=S1 n=2"];
  let i = 0;
  const io = {
    agentList: () => [{ name: "reviewer", agent_status: "idle" }],
    agentRead: () => screens[Math.min(i++, screens.length - 1)],
    agentPrompt: () => {},
    send: () => {},
    log: () => {},
  };
  daemon.runOnce(p, io);
  daemon.runOnce(p, io);
  daemon.runOnce(p, io);
  assert.equal(daemon.loadState(p.projectDir).rebounds.S1, 2);
});

test("un BUG reenviado por el daemon (eco) no cuenta como rebote", () => {
  const p = project();
  const sent = [];
  const io = { send: (m) => sent.push(m), log: () => {}, agentPrompt: () => {}, agentList: () => [], agentRead: () => "" };
  const state = daemon.loadState(p.projectDir);
  // dev no tiene ruta BUG configurada → es un eco, no un bug real.
  daemon.applyRoute(p, { fromPersona: "dev", event: "BUG", story: "S1", extra: {} }, state, io);
  assert.equal(state.rebounds.S1 || 0, 0);
  assert.equal(sent.length, 0);
});

test("BUG rutea al dev dueño de la story y el DONE del reviewer la marca hecha", () => {
  const p = project({ routes: [{ on: "DONE", from: "dev", to: "reviewer" }, { on: "DONE", from: "reviewer", to: "orquestador" }, { on: "BUG", from: "reviewer", to: "dev" }] });
  const sent = [];
  const io = { send: (m) => sent.push(m), log: () => {}, agentPrompt: () => {}, agentList: () => [], agentRead: () => "" };
  const state = daemon.loadState(p.projectDir);
  state.stories.S1 = { dev: "dev-2", branch: "hermad/S1", status: "assigned" };

  daemon.applyRoute(p, { fromPersona: "reviewer", event: "BUG", story: "S1", extra: {} }, state, io);
  assert.equal(sent[sent.length - 1].to, "dev-2");

  // el DONE del dev dueño es handoff a review, todavía no cierra la story
  daemon.applyRoute(p, { fromPersona: "dev", fromAgent: "dev-2", event: "DONE", story: "S1", extra: {} }, state, io);
  assert.notEqual(state.stories.S1.status, "done");
  // el DONE del reviewer (ruta al orquestador) sí la cierra
  daemon.applyRoute(p, { fromPersona: "reviewer", fromAgent: "reviewer", event: "DONE", story: "S1", extra: {} }, state, io);
  assert.equal(state.stories.S1.status, "done");
});

test("un solo mensaje por tick y no se pierde si el prompt falla", () => {
  const p = project();
  daemon.send(p.projectDir, { from: "orquestador", to: "dev", text: "msg 1" });
  daemon.send(p.projectDir, { from: "orquestador", to: "dev", text: "msg 2" });
  const inbox = path.join(p.projectDir, ".hermad", "inbox", "dev");
  assert.equal(fs.readdirSync(inbox).filter((f) => f.endsWith(".md")).length, 2, "no se pisan");

  let fail = true;
  const prompted = [];
  const io = {
    agentList: () => [{ name: "dev", agent_status: "idle" }],
    agentRead: () => "",
    agentPrompt: (n, t) => {
      if (fail) throw new Error("busy");
      prompted.push(t);
    },
    send: () => {},
    log: () => {},
  };
  daemon.runOnce(p, io);
  assert.equal(prompted.length, 0);
  assert.equal(fs.readdirSync(inbox).filter((f) => f.endsWith(".md")).length, 2, "el fallo no mueve a done/");

  fail = false;
  daemon.runOnce(p, io);
  assert.equal(prompted.length, 1, "solo uno por tick");
  daemon.runOnce(p, io);
  assert.equal(prompted.length, 2);
});

test("compact watchdog actúa con % contextual y no con un % cualquiera", () => {
  const p = project({ personas: { dev: { kind: "opencode" } }, routes: [] });
  const ctx = stubIo({ list: [{ name: "dev", agent_status: "idle" }], read: { dev: "Context: 62% used" } });
  daemon.runOnce(p, ctx.io);
  assert.ok(ctx.prompted.some((m) => m.text === "/compact"), "compacts a 62%");

  const decoy = project({ personas: { dev: { kind: "opencode" } }, routes: [] });
  const noCtx = stubIo({ list: [{ name: "dev", agent_status: "idle" }], read: { dev: "100% build ok" } });
  daemon.runOnce(decoy, noCtx.io);
  assert.equal(noCtx.prompted.length, 0, "no actúa sin contexto parseable");

  const claude = stubIo({ list: [{ name: "dev", agent_status: "idle" }], read: { dev: "Context: 90% used" } });
  daemon.runOnce(project({ personas: { dev: { kind: "claude" } }, routes: [] }), claude.io);
  assert.equal(claude.prompted.length, 0, "claude compacta nativo, no watchdog");
});

test("runOnce ignora un agente detectado sin nombre y entrega al válido", () => {
  const p = project();
  daemon.send(p.projectDir, { from: "orquestador", to: "dev", text: "haz S1" });
  // formato real de `herdr agent list`: el agente detectado sin `agent start` trae name:null.
  const list = [
    { name: null, agent: "claude", agent_status: "idle", workspace_id: "w1" },
    { name: "dev", agent: "claude", agent_status: "idle", workspace_id: "w1" },
  ];
  const { io, prompted } = stubIo({ list, read: { dev: "" } });
  assert.doesNotThrow(() => daemon.runOnce(p, io));
  assert.ok(prompted.some((m) => m.name === "dev" && /haz S1/.test(m.text)), "el válido igual recibe");
});

test("un agente que falla no tumba el tick para los demás", () => {
  const p = project();
  const sent = [];
  let calls = 0;
  const io = {
    agentList: () => [
      { name: "dev", agent_status: "idle" },
      { name: "reviewer", agent_status: "idle" },
    ],
    agentRead: (name) => (name === "dev" ? "HERMAD:DONE story=S1" : "HERMAD:BUG story=S2"),
    agentPrompt: () => {},
    // el 1.º send (ruta del dev) explota; el del reviewer debe seguir.
    send: (m) => {
      if (++calls === 1) throw new Error("send boom");
      sent.push(m);
    },
    log: () => {},
  };
  assert.doesNotThrow(() => daemon.runOnce(p, io));
  assert.ok(sent.some((m) => m.to === "dev" && /story=S2/.test(m.text)), "el reviewer se procesa igual");
});

test("runOnce ignora agentes de otro workspace cuando el state conoce el suyo", () => {
  const p = project();
  daemon.saveState(p.projectDir, { ...daemon.loadState(p.projectDir), workspaceId: "w1" });
  daemon.send(p.projectDir, { from: "orquestador", to: "dev", text: "haz S1" });

  const other = stubIo({ list: [{ name: "dev", agent_status: "idle", workspace_id: "w2" }], read: { dev: "" } });
  daemon.runOnce(p, other.io);
  assert.equal(other.prompted.length, 0, "otro workspace: ignorado");

  const mine = stubIo({ list: [{ name: "dev", agent_status: "idle", workspace_id: "w1" }], read: { dev: "" } });
  daemon.runOnce(p, mine.io);
  assert.equal(mine.prompted.length, 1, "mismo workspace: entrega");
});
