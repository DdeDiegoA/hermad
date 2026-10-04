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

test("parseMarkers solo cuenta una línea completa (cita inline, ruido y falta de n se ignoran)", () => {
  const text = [
    'instrucción pegada: usá "HERMAD:DONE story=S1 n=1"; no lo cites',
    "HERMAD:DONE story=S1 n=1",
    "HERMAD:DONE story=S1 n=2.",
    "HERMAD:DONE story=S1",
    "HERMAD:INVENTADO story=S1 n=1",
  ].join("\n");
  assert.deepEqual(daemon.parseMarkers(text), [
    { event: "DONE", story: "S1", extra: { n: "1" }, raw: "HERMAD:DONE story=S1 n=1" },
  ]);
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
  const read = { dev: "trabajando...\nHERMAD:DONE story=S1 n=1" };
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
  const { io, sent } = stubIo({ list: [{ name: "dev-1", agent_status: "idle" }], read: { "dev-1": "HERMAD:DONE story=S1 n=1" } });
  daemon.runOnce(p, io);
  assert.ok(sent.some((m) => m.to === "reviewer" && /story=S1/.test(m.text)));
});

test("un marcador que la TUI vuelve a dibujar no se dispara de nuevo", () => {
  const p = project({ routes: [{ on: "DONE", from: "dev", to: "reviewer" }] });
  const screens = ["HERMAD:DONE story=S1 n=1", "otra cosa", "HERMAD:DONE story=S1 n=1"];
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

test("un 2.º BUG legítimo se distingue con un n nuevo", () => {
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

// Regresión en vivo: el dedupe por conteo disparaba la ruta cada vez que la misma
// línea aparecía más veces en pantalla (cita en un mensaje posterior, redibujo).
const screenIo = (screens) => {
  let i = 0;
  const sent = [];
  return {
    sent,
    io: {
      agentList: () => [{ name: "dev", agent_status: "idle" }],
      agentRead: () => screens[Math.min(i++, screens.length - 1)],
      agentPrompt: () => {},
      send: (m) => sent.push(m),
      log: () => {},
    },
  };
};

test("el mismo marcador dos veces en pantalla dispara una sola vez", () => {
  const p = project({ routes: [{ on: "DONE", from: "dev", to: "reviewer" }] });
  const screens = [
    "HERMAD:DONE story=S1 n=1\nHERMAD:DONE story=S1 n=1",
    "HERMAD:DONE story=S1 n=1\nnota nueva",
    "HERMAD:DONE story=S1 n=1",
  ];
  const { io, sent } = screenIo(screens);
  daemon.runOnce(p, io);
  daemon.runOnce(p, io);
  daemon.runOnce(p, io);
  assert.equal(sent.filter((m) => m.to === "reviewer").length, 1, "la identidad DONE|S1|1 ya está vista");
});

test("re-emitir con n=2 sí dispara de nuevo", () => {
  const p = project({ routes: [{ on: "DONE", from: "dev", to: "reviewer" }] });
  const screens = ["HERMAD:DONE story=S1 n=1", "HERMAD:DONE story=S1 n=1", "HERMAD:DONE story=S1 n=2"];
  const { io, sent } = screenIo(screens);
  daemon.runOnce(p, io);
  daemon.runOnce(p, io);
  daemon.runOnce(p, io);
  assert.equal(sent.filter((m) => m.to === "reviewer").length, 2, "n nuevo = evento nuevo");
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
    agentRead: (name) => (name === "dev" ? "HERMAD:DONE story=S1 n=1" : "HERMAD:BUG story=S2 n=1"),
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

test("loadState completa defaults (agents, closed) sobre un state viejo", () => {
  const p = project();
  fs.mkdirSync(path.join(p.projectDir, ".hermad"), { recursive: true });
  fs.writeFileSync(path.join(p.projectDir, ".hermad", "state.json"), JSON.stringify({ rebounds: { S1: 1 } }));
  const s = daemon.loadState(p.projectDir);
  assert.deepEqual(s.rebounds, { S1: 1 });
  for (const k of ["agents", "closed", "screens", "markers", "stories", "compact"]) {
    assert.deepEqual(s[k], {}, `default ${k}`);
  }
});

test("saveState escribe atómico: JSON completo y sin tmp suelto", () => {
  const p = project();
  daemon.saveState(p.projectDir, { ...daemon.loadState(p.projectDir), workspaceId: "w1" });
  const dir = path.join(p.projectDir, ".hermad");
  assert.equal(fs.readdirSync(dir).filter((f) => f.includes(".tmp-")).length, 0, "no queda tmp");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8")).workspaceId, "w1");
});

test("withStateLock reclama un lock stale de más de 10s", () => {
  const p = project();
  const lock = path.join(p.projectDir, ".hermad", "state.lock");
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, "viejo");
  const old = (Date.now() - 11000) / 1000;
  fs.utimesSync(lock, old, old);
  assert.equal(daemon.withStateLock(p.projectDir, () => "ok"), "ok");
  assert.equal(fs.existsSync(lock), false, "libera el lock al salir");
});

test("withStateLock respeta un lock fresco hasta el timeout", () => {
  const p = project();
  const lock = path.join(p.projectDir, ".hermad", "state.lock");
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, "fresco");
  assert.throws(() => daemon.withStateLock(p.projectDir, () => "x", { timeoutMs: 120 }), /lock/);
  assert.ok(fs.existsSync(lock), "no pisa el lock ajeno");
});

test("updateState no pisa una clave escrita entre el load y el save", () => {
  const p = project();
  const staleCopy = daemon.loadState(p.projectDir); // copia que el daemon leyó al arrancar
  // writer CLI escribe agents mientras el daemon tenía su copia vieja
  daemon.updateState(p.projectDir, (s) => {
    s.agents = { architect: { live: "architect" } };
  });
  assert.deepEqual(staleCopy.agents, {}, "la copia vieja no conocía la clave");
  // el daemon aplica su parche con updateState (lectura fresca), no con su copia
  daemon.updateState(p.projectDir, (s) => {
    s.screens = { architect: "hash" };
  });
  const final = daemon.loadState(p.projectDir);
  assert.ok(final.agents.architect, "la clave del CLI sobrevive al save del daemon");
  assert.equal(final.screens.architect, "hash");
});

test("una escritura del CLI durante el tick no se pierde", () => {
  const p = project({ personas: { dev: { kind: "claude" } }, routes: [] });
  daemon.send(p.projectDir, { from: "orquestador", to: "dev", text: "haz S1" });
  let injected = false;
  const io = {
    agentList: () => [{ name: "dev", agent_status: "idle" }],
    agentRead: () => "",
    agentPrompt: () => {
      if (injected) return;
      injected = true;
      // CLI concurrente: toma su propio lock y escribe agents a mitad del tick.
      daemon.updateState(p.projectDir, (s) => {
        s.agents = { architect: { live: "architect" } };
      });
    },
    send: () => {},
    log: () => {},
  };
  daemon.runOnce(p, io);
  assert.ok(daemon.loadState(p.projectDir).agents.architect, "el save final del daemon no la pisa");
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

test("un marcador citado dentro de una instrucción no dispara la ruta", () => {
  const p = project({ routes: [{ on: "DONE", from: "dev", to: "reviewer" }] });
  const { io, sent } = stubIo({
    list: [{ name: "dev", agent_status: "idle" }],
    read: { dev: 'emití "HERMAD:DONE story=S1 n=1" al terminar;\nseguí con la S2' },
  });
  daemon.runOnce(p, io);
  assert.equal(sent.length, 0, "la cita no es un evento");
});

test("con alias, el daemon entrega al vivo y keyea marcadores por el lógico", () => {
  const p = project();
  daemon.updateState(p.projectDir, (s) => {
    s.agents = { "dev-1": { live: "hermad-dev-1", persona: "dev" } };
  });
  daemon.send(p.projectDir, { from: "orquestador", to: "dev-1", text: "hacé S3b" });

  const { io, sent, prompted } = stubIo({
    list: [{ name: "hermad-dev-1", agent_status: "idle" }],
    read: { "hermad-dev-1": "arrancando\nHERMAD:DONE story=S3b n=1" },
  });
  daemon.runOnce(p, io);

  assert.ok(prompted.some((m) => m.name === "hermad-dev-1" && /hacé S3b/.test(m.text)), "promptea al nombre vivo");
  const done = sent.find((m) => /story=S3b/.test(m.text));
  assert.ok(done, "rutea el DONE");
  assert.equal(done.from, "dev-1", "firma con el lógico, no con la persona");
  assert.equal(done.to, "reviewer");
  assert.ok(daemon.loadState(p.projectDir).markers["dev-1"], "el dedupe vive bajo el lógico");
});

test("poda state.agents cuyo vivo no aparece 3 ticks seguidos", () => {
  const p = project({ routes: [] });
  const io = { agentList: () => [], agentRead: () => "", agentPrompt: () => {}, send: () => {}, log: () => {} };
  daemon.updateState(p.projectDir, (s) => {
    s.agents = { dev: { live: "muerto" } };
  });
  daemon.runOnce(p, io);
  daemon.runOnce(p, io);
  assert.ok(daemon.loadState(p.projectDir).agents.dev, "a los 2 ticks todavía está");
  daemon.runOnce(p, io);
  assert.equal(daemon.loadState(p.projectDir).agents.dev, undefined, "al 3.º se poda");

  // si el vivo reaparece, el contador se resetea
  daemon.updateState(p.projectDir, (s) => {
    s.agents = { dev: { live: "vivo" } };
  });
  const seen = { ...io, agentList: () => [{ name: "vivo", agent_status: "idle" }] };
  daemon.runOnce(p, seen);
  daemon.runOnce(p, io);
  daemon.runOnce(p, io);
  assert.ok(daemon.loadState(p.projectDir).agents.dev, "el vivo visto en el medio resetea la cuenta");
});

test("send normaliza un nombre vivo a lógico antes de encolar", () => {
  const { normalizeTarget } = require("../src/commands/send");
  const p = project();
  daemon.updateState(p.projectDir, (s) => {
    s.agents = { architect: { live: "hermad-architect" } };
  });
  assert.equal(normalizeTarget(p.projectDir, "hermad-architect"), "architect");
  assert.equal(normalizeTarget(p.projectDir, "legacy"), "legacy");
  const file = daemon.send(p.projectDir, { from: "orq", to: normalizeTarget(p.projectDir, "hermad-architect"), text: "hola" });
  assert.ok(file.includes(path.join(".hermad", "inbox", "architect")), `buzón lógico: ${file}`);
});
